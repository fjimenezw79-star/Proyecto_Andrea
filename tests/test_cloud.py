"""Etapa 6: publicación de la tienda en Cloudflare Pages y recogida de pedidos (con un Cloudflare simulado)."""
import base64
import json
import re
import uuid

import pytest
from blake3 import blake3

from server.store import cloud


@pytest.fixture()
def cf(app, monkeypatch, tmp_path):
    app.config.update(CLOUDFLARE_ACCOUNT_ID="acct1", CLOUDFLARE_API_TOKEN="tok", CLOUDFLARE_PAGES_PROJECT="mi-tienda",
                      DATA_DIR=str(tmp_path / "data"))
    cloud.bind(app)
    calls = []
    kv: dict[str, dict] = {}

    def fake_http(method, url, headers=None, body=None, timeout=60):
        calls.append({"method": method, "url": url, "headers": headers or {}, "body": body})
        ok = lambda result: (200, json.dumps({"success": True, "errors": [], "result": result}).encode())  # noqa: E731
        path = url.replace(cloud.API, "")
        if path == "/accounts/acct1/pages/projects/mi-tienda" and method == "GET":
            return 404, json.dumps({"success": False, "errors": [{"message": "no existe"}]}).encode()
        if path == "/accounts/acct1/pages/projects" and method == "POST":
            return ok({"name": "mi-tienda"})
        if path == "/accounts/acct1/storage/kv/namespaces":
            return ok({"id": "kv123"})
        if path == "/accounts/acct1/pages/projects/mi-tienda" and method == "PATCH":
            return ok({})
        if path.endswith("/upload-token"):
            return ok({"jwt": "jwt-abc"})
        if path == "/pages/assets/check-missing":
            return ok(json.loads(body)["hashes"])
        if path in ("/pages/assets/upload", "/pages/assets/upsert-hashes"):
            return ok(True)
        if path.endswith("/deployments"):
            return ok({"id": "dep1", "url": "https://abc.mi-tienda.pages.dev"})
        if url == "https://mi-tienda.pages.dev/api/pedidos":
            ok_auth = headers.get("Authorization") == f"Bearer {cloud.secret()}"
            return (200, json.dumps({"ok": True, "orders": list(kv.values())}).encode()) if ok_auth else (401, b"{}")
        if url == "https://mi-tienda.pages.dev/api/pedidos/ack":
            for i in json.loads(body)["ids"]:
                kv.pop(i, None)
            return 200, b'{"ok":true}'
        return 500, b"{}"

    monkeypatch.setattr(cloud, "_http", fake_http)
    yield {"calls": calls, "kv": kv}
    app.config.update(CLOUDFLARE_ACCOUNT_ID="", CLOUDFLARE_API_TOKEN="")


def test_hash_is_blake3_of_base64_plus_extension(tmp_path):
    f = tmp_path / "a.css"
    f.write_bytes(b"body{}")
    expected = blake3((base64.b64encode(b"body{}").decode() + "css").encode()).hexdigest()[:32]
    assert cloud.hash_file(f) == expected and len(expected) == 32


def test_build_site_is_complete_and_private(app, cf, v1, tmp_path):
    out = tmp_path / "sitio"
    files = cloud.build_site(app, out, "https://mi-tienda.pages.dev")
    names = {p.relative_to(out).as_posix() for p in files}
    assert {"index.html", "tienda.js", "tienda.css", "logo.webp", "_worker.js", "_headers"} <= names
    page = next(n for n in names if re.match(r"p/princesas-disney-\d+/index.html", n))
    html = (out / page).read_text()
    assert 'content="https://mi-tienda.pages.dev/og/' in html and '"api":"/api/"' in html
    assert any(n.startswith("og/") and n.endswith(".jpg") for n in names)
    assert any(n.startswith("img/") for n in names)
    assert "cost_cents" not in (out / "index.html").read_text() and "20000" not in (out / "index.html").read_text()
    assert cloud.secret() in (out / "_worker.js").read_text()


def test_deploy_follows_pages_direct_upload(app, cf, v1, tmp_path):
    out = tmp_path / "sitio"
    cloud.build_site(app, out, "https://mi-tienda.pages.dev")
    cloud.ensure_project()
    cloud.deploy(out)
    paths = [c["url"].replace(cloud.API, "") for c in cf["calls"]]
    assert paths[:4] == ["/accounts/acct1/pages/projects/mi-tienda", "/accounts/acct1/pages/projects",
                         "/accounts/acct1/storage/kv/namespaces", "/accounts/acct1/pages/projects/mi-tienda"]
    patch = json.loads(cf["calls"][3]["body"])
    assert patch["deployment_configs"]["production"]["kv_namespaces"]["ORDERS"]["namespace_id"] == "kv123"
    assert cf["calls"][0]["headers"]["Authorization"] == "Bearer tok"

    upload = next(c for c in cf["calls"] if c["url"].endswith("/pages/assets/upload"))
    assert upload["headers"]["Authorization"] == "Bearer jwt-abc"
    item = json.loads(upload["body"])[0]
    assert item["base64"] is True and len(item["key"]) == 32 and "contentType" in item["metadata"]

    dep = cf["calls"][-1]
    assert dep["url"].endswith("/accounts/acct1/pages/projects/mi-tienda/deployments")
    body = dep["body"]
    assert dep["headers"]["Content-Type"].startswith("multipart/form-data; boundary=")
    manifest = json.loads(re.search(rb'name="manifest"\r\n\r\n(.*?)\r\n--', body, re.S).group(1))
    assert "/index.html" in manifest and "/_worker.js" not in manifest
    assert manifest["/index.html"] == cloud.hash_file(out / "index.html")
    assert b'name="_worker.bundle"; filename="_worker.bundle"' in body
    assert b'{"main_module": "_worker.js"}' in body and b"application/javascript+module" in body
    # una segunda publicación ya no vuelve a crear el KV
    cf["calls"].clear()
    cloud.ensure_project()
    assert not any("kv/namespaces" in c["url"] for c in cf["calls"])


def test_pull_orders_registers_and_acknowledges(app, admin, cf, v1):
    good = {"id": str(uuid.uuid4()), "folio": "W-QWERT", "name": "Ana", "phone": "4730001122", "delivery": "pickup",
            "items": [{"variant_id": v1, "qty": 1}]}
    bad = {"id": str(uuid.uuid4()), "folio": "W-ZZZZZ", "name": "", "phone": "1", "items": []}
    cf["kv"].update({good["id"]: good, bad["id"]: bad})
    assert cloud.pull_orders(app) == 2
    assert cf["kv"] == {}  # los dos se borran allá (el inválido no se puede registrar nunca)
    orders = admin.get("/api/online-orders").get_json()["orders"]
    assert [(o["folio"], o["source"]) for o in orders] == [("W-QWERT", "cloudflare")]
    assert cloud.pull_orders(app) == 0


def test_api_errors_are_reported(app, cf, monkeypatch):
    monkeypatch.setattr(cloud, "_http", lambda *a, **k: (403, b'{"success":false,"errors":[{"message":"token sin permisos"}]}'))
    with pytest.raises(cloud.CloudError, match="token sin permisos"):
        cloud.ensure_project()


def test_status_and_public_url(app, cf, admin):
    d = admin.get("/api/store").get_json()
    assert d["public_url"] == "https://mi-tienda.pages.dev/" and d["cloud"]["configured"] is True
