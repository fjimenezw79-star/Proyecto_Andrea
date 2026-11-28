"""Publicación de la tienda en Cloudflare Pages y recogida de pedidos.

Con ``CLOUDFLARE_ACCOUNT_ID`` y ``CLOUDFLARE_API_TOKEN`` en ``.env``, la PC:
- genera la tienda como sitio fijo (portada, una página por producto, fotos y vistas previas) y la publica
  cuando cambian productos, precios, fotos o existencias (o con "Publicar ahora");
- cada minuto recoge los pedidos que el sitio guardó (KV) y los registra como "Pedidos en línea · pendientes".

Así la tienda funciona aunque la PC esté apagada. Sin esas claves, la tienda se ve desde la PC en ``/tienda/``.
El protocolo de subida es el de Cloudflare Pages "Direct Upload" (el mismo que usa su herramienta wrangler).
"""
from __future__ import annotations

import base64
import hashlib
import json
import mimetypes
import secrets
import shutil
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path

API = "https://api.cloudflare.com/client/v4"
HERE = Path(__file__).resolve().parent
MAX_BUCKET_BYTES = 40 * 1024 * 1024
MAX_BUCKET_FILES = 2000
PUBLISH_EVERY_S = 180

_app = None
_state = {"publishing": False, "last_publish": None, "last_error": None, "last_pull": None, "pulled": 0,
          "fingerprint": None}
_wake = threading.Event()
_force = threading.Event()


class CloudError(Exception):
    pass


# ---------------- configuración ----------------

def _cfg(key: str) -> str:
    import os

    app = _app
    if app is not None and key in app.config:
        return str(app.config.get(key) or "").strip()
    return os.environ.get(key, "").strip()


def configured() -> bool:
    return bool(_cfg("CLOUDFLARE_ACCOUNT_ID") and _cfg("CLOUDFLARE_API_TOKEN"))


def project() -> str:
    return _cfg("CLOUDFLARE_PAGES_PROJECT") or "modas-andrea-tienda"


def public_url() -> str | None:
    if not configured():
        return None
    return (_cfg("STORE_URL") or f"https://{project()}.pages.dev").rstrip("/") + "/"


def status() -> dict:
    return {"configured": configured(), "url": public_url(), **{k: v for k, v in _state.items() if k != "fingerprint"}}


def _data_file(name: str) -> Path:
    base = Path(_app.config["DATA_DIR"]) if _app is not None else HERE.parent.parent / "data"
    base.mkdir(parents=True, exist_ok=True)
    return base / name


def secret() -> str:
    """Clave que comparten la PC y el sitio para recoger pedidos (se crea una sola vez)."""
    path = _data_file(".tienda_secret")
    if path.exists() and len(path.read_text().strip()) >= 32:
        return path.read_text().strip()
    s = secrets.token_hex(32)
    path.write_text(s)
    return s


# ---------------- generar el sitio ----------------

def hash_file(path: Path) -> str:
    """Hash de Cloudflare Pages: BLAKE3 del contenido en base64 + extensión, 32 caracteres."""
    from blake3 import blake3

    b64 = base64.b64encode(path.read_bytes()).decode()
    return blake3((b64 + path.suffix.lstrip(".")).encode()).hexdigest()[:32]


def build_site(app, out: Path, origin: str) -> list[Path]:
    """Escribe la tienda completa en ``out`` (raíz del sitio = "/")."""
    from . import STATIC, og_image, payload, render_page, store_products
    from ..blueprints.settings import get_settings

    out = Path(out)
    if out.exists():
        shutil.rmtree(out)
    (out / "img").mkdir(parents=True)
    (out / "og").mkdir()
    (out / "fonts").mkdir()
    uploads = Path(app.config["UPLOAD_DIR"])
    with app.test_request_context("/", base_url=origin):
        data = payload("/", "/api/")
        (out / "index.html").write_text(render_page("/", "/api/", origin, data=data), encoding="utf-8")
        for p in store_products(bool(get_settings()["store_hide_sold_out"])):
            from . import product_slug

            d = out / "p" / product_slug(p)
            d.mkdir(parents=True, exist_ok=True)
            (d / "index.html").write_text(render_page("/", "/api/", origin, product=p, data=data), encoding="utf-8")
            for ph in p.photos:
                src = uploads / ph.filename
                if src.is_file():
                    shutil.copyfile(src, out / "img" / ph.filename)
            first = uploads / p.photos[0].filename
            if first.is_file():
                (out / "og" / f"{p.id}.jpg").write_bytes(og_image(first))
    for name in ("tienda.css", "tienda.js", "logo.webp"):
        shutil.copyfile(STATIC / name, out / name)
    for f in (STATIC / "fonts").iterdir():
        shutil.copyfile(f, out / "fonts" / f.name)
    (out / "_worker.js").write_text((HERE / "_worker.js").read_text(encoding="utf-8").replace("__SECRET__", secret()),
                                    encoding="utf-8")
    (out / "_headers").write_text("/img/*\n  Cache-Control: public, max-age=86400\n/fonts/*\n  Cache-Control: public, max-age=2592000\n",
                                  encoding="utf-8")
    return sorted(p for p in out.rglob("*") if p.is_file())


# ---------------- API de Cloudflare ----------------

def _http(method: str, url: str, headers: dict | None = None, body: bytes | None = None, timeout: int = 60):
    """Devuelve (código, cuerpo en bytes). Separado para poder simularlo en las pruebas."""
    req = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def _api(method: str, path: str, *, token: str | None = None, payload=None, raw: bytes | None = None,
         content_type: str | None = None, ok404: bool = False):
    headers = {"Authorization": f"Bearer {token or _cfg('CLOUDFLARE_API_TOKEN')}"}
    body = raw
    if payload is not None:
        body = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    elif content_type:
        headers["Content-Type"] = content_type
    code, data = _http(method, API + path, headers, body)
    try:
        doc = json.loads(data or b"{}")
    except ValueError:
        doc = {}
    if code == 404 and ok404:
        return None
    if code >= 400 or not doc.get("success", False):
        errs = "; ".join(str(e.get("message", e)) for e in doc.get("errors", [])) or f"HTTP {code}"
        raise CloudError(f"Cloudflare respondió: {errs}")
    return doc.get("result")


def _multipart(parts: list[tuple[str, str | None, str | None, bytes]]) -> tuple[bytes, str]:
    """Arma un cuerpo multipart/form-data. Cada parte: (nombre, archivo, tipo, contenido)."""
    boundary = "----modasandrea" + uuid.uuid4().hex
    out = bytearray()
    for name, filename, ctype, content in parts:
        out += f"--{boundary}\r\n".encode()
        disp = f'form-data; name="{name}"' + (f'; filename="{filename}"' if filename else "")
        out += f"Content-Disposition: {disp}\r\n".encode()
        if ctype:
            out += f"Content-Type: {ctype}\r\n".encode()
        out += b"\r\n" + content + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return bytes(out), f"multipart/form-data; boundary={boundary}"


def ensure_project() -> None:
    """Crea el proyecto de Pages y el almacenamiento de pedidos (KV) la primera vez."""
    acct, name = _cfg("CLOUDFLARE_ACCOUNT_ID"), project()
    if _api("GET", f"/accounts/{acct}/pages/projects/{name}", ok404=True) is None:
        _api("POST", f"/accounts/{acct}/pages/projects", payload={"name": name, "production_branch": "main"})
    kv_file = _data_file(".tienda_kv")
    kv_id = kv_file.read_text().strip() if kv_file.exists() else ""
    if not kv_id:
        kv_id = _api("POST", f"/accounts/{acct}/storage/kv/namespaces", payload={"title": f"{name}-pedidos"})["id"]
        kv_file.write_text(kv_id)
    _api("PATCH", f"/accounts/{acct}/pages/projects/{name}", payload={"deployment_configs": {"production": {
        "kv_namespaces": {"ORDERS": {"namespace_id": kv_id}}, "compatibility_date": "2025-01-01"}}})


def deploy(out: Path) -> str:
    """Sube el sitio de ``out`` y crea un despliegue de producción. Devuelve el id del despliegue."""
    acct, name = _cfg("CLOUDFLARE_ACCOUNT_ID"), project()
    special = {"_worker.js", "_headers", "_redirects", "_routes.json"}
    files = {}
    for p in sorted(Path(out).rglob("*")):
        rel = p.relative_to(out).as_posix()
        if p.is_file() and rel not in special:
            files[rel] = {"path": p, "hash": hash_file(p), "size": p.stat().st_size,
                          "type": mimetypes.guess_type(p.name)[0] or "application/octet-stream"}
    jwt = _api("GET", f"/accounts/{acct}/pages/projects/{name}/upload-token")["jwt"]
    hashes = [f["hash"] for f in files.values()]
    missing = set(_api("POST", "/pages/assets/check-missing", token=jwt, payload={"hashes": hashes}) or [])
    todo = sorted((f for f in files.values() if f["hash"] in missing), key=lambda f: -f["size"])
    buckets: list[list[dict]] = []
    for f in todo:
        for b in buckets:
            if sum(x["size"] for x in b) + f["size"] <= MAX_BUCKET_BYTES and len(b) < MAX_BUCKET_FILES:
                b.append(f)
                break
        else:
            buckets.append([f])
    for b in buckets:
        _api("POST", "/pages/assets/upload", token=jwt, payload=[
            {"key": f["hash"], "value": base64.b64encode(f["path"].read_bytes()).decode(),
             "metadata": {"contentType": f["type"]}, "base64": True} for f in b])
    _api("POST", "/pages/assets/upsert-hashes", token=jwt, payload={"hashes": hashes})

    worker = (Path(out) / "_worker.js").read_bytes()
    bundle, bundle_type = _multipart([
        ("metadata", None, None, json.dumps({"main_module": "_worker.js"}).encode()),
        ("_worker.js", "_worker.js", "application/javascript+module", worker),
    ])
    manifest = {f"/{rel}": f["hash"] for rel, f in files.items()}
    parts = [("manifest", None, None, json.dumps(manifest).encode()), ("branch", None, None, b"main"),
             ("_worker.bundle", "_worker.bundle", bundle_type, bundle)]
    headers = Path(out) / "_headers"
    if headers.exists():
        parts.append(("_headers", "_headers", "text/plain", headers.read_bytes()))
    body, ctype = _multipart(parts)
    result = _api("POST", f"/accounts/{acct}/pages/projects/{name}/deployments", raw=body, content_type=ctype)
    return str((result or {}).get("id", ""))


# ---------------- pedidos guardados en el sitio ----------------

def pull_orders(app) -> int:
    """Trae los pedidos guardados en Cloudflare, los registra y los borra de allá. Devuelve cuántos llegaron."""
    from ..services import online_orders

    base = public_url()
    if not base:
        return 0
    auth = {"Authorization": f"Bearer {secret()}"}
    code, data = _http("GET", base + "api/pedidos", auth)
    if code != 200:
        raise CloudError(f"No se pudieron recoger los pedidos (HTTP {code}).")
    orders = json.loads(data or b"{}").get("orders", [])
    done = []
    with app.app_context():
        for o in orders:
            try:
                online_orders.intake(o, source="cloudflare")
                done.append(o.get("id"))
            except Exception as e:  # un pedido inválido no detiene a los demás; se descarta allá
                app.logger.warning("Pedido de la tienda rechazado: %s", e)
                done.append(o.get("id"))
    if done:
        _http("POST", base + "api/pedidos/ack", {**auth, "Content-Type": "application/json"},
              json.dumps({"ids": done}).encode())
    return len(orders)


# ---------------- trabajo en segundo plano ----------------

def fingerprint(app) -> str:
    from . import asset_version, payload
    from ..blueprints.settings import get_settings

    with app.app_context():
        doc = json.dumps([payload("/", "/api/"), get_settings(), asset_version()], sort_keys=True, default=str)
    return hashlib.sha256(doc.encode()).hexdigest()


def publish_now(app) -> None:
    _state["publishing"] = True
    try:
        out = Path(app.config["DATA_DIR"]) / "tienda_publicada"
        with app.app_context():
            build_site(app, out, public_url().rstrip("/"))
        ensure_project()
        deploy(out)
        _state.update(last_publish=datetime.now().replace(microsecond=0).isoformat(), last_error=None)
    except Exception as e:
        _state["last_error"] = str(e)[:300]
        raise
    finally:
        _state["publishing"] = False


def request_publish() -> None:
    _force.set()
    _wake.set()


def _loop(app) -> None:
    last = 0.0
    while True:
        _wake.wait(60)
        _wake.clear()
        if not configured():
            continue
        try:
            n = pull_orders(app)
            _state.update(last_pull=datetime.now().replace(microsecond=0).isoformat(), pulled=_state["pulled"] + n)
        except Exception as e:  # sin internet: se intenta al siguiente minuto
            _state["last_error"] = str(e)[:300]
        try:
            fp = fingerprint(app)
            due = fp != _state["fingerprint"] and time.monotonic() - last >= PUBLISH_EVERY_S
            if _force.is_set() or due:
                _force.clear()
                publish_now(app)
                _state["fingerprint"], last = fp, time.monotonic()
        except Exception:
            app.logger.exception("No se pudo publicar la tienda")


def start(app) -> None:
    """Arranca el trabajo en segundo plano (solo con el servidor real, no en las pruebas)."""
    global _app
    _app = app
    if configured():
        threading.Thread(target=_loop, args=(app,), name="tienda-cloudflare", daemon=True).start()
        _wake.set()


def bind(app) -> None:
    global _app
    _app = app
