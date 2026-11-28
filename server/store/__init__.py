"""Tienda en línea (estilo Revista): páginas públicas generadas del inventario y pedidos por WhatsApp.

La misma plantilla sirve en dos lugares:
- en la PC del negocio, en ``/tienda/`` (por el túnel de internet o la red local), siempre al día;
- en Cloudflare Pages (``cloud.py``), como sitio fijo que funciona aunque la PC esté apagada.
"""
from __future__ import annotations

import hashlib
import io
import json
import time
from collections import defaultdict, deque
from pathlib import Path

from flask import Blueprint, abort, current_app, redirect, render_template, request, send_file, send_from_directory
from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..api_util import fail, ok
from ..db import session
from ..models import Category, Product, ProductPhoto
from ..services.catalog import slugify

HERE = Path(__file__).resolve().parent
STATIC = HERE / "static"
ASSETS = ("tienda.css", "tienda.js", "logo.webp")
OG_SIZE = (1200, 630)

bp = Blueprint("store", __name__, url_prefix="/tienda", template_folder="templates")


def asset_version() -> str:
    h = hashlib.sha256()
    for name in ASSETS[:2]:
        h.update((STATIC / name).read_bytes())
    return h.hexdigest()[:10]


def product_slug(p: Product) -> str:
    return f"{slugify(p.name)}-{p.id}"


def _root_name(c: Category | None) -> str:
    seen = 0
    while c is not None and c.parent is not None and seen < 20:
        c, seen = c.parent, seen + 1
    return c.name if c else "Otros"


def _settings() -> dict:
    from ..blueprints.settings import get_settings

    return get_settings()


def store_products(hide_sold_out: bool) -> list[Product]:
    q = (select(Product).options(selectinload(Product.variants), selectinload(Product.photos),
                                 selectinload(Product.category))
         .where(Product.active.is_(True), Product.online.is_(True)).order_by(Product.name, Product.id))
    out = []
    for p in session.scalars(q):
        vs = [v for v in p.variants if v.active]
        if not p.photos or not vs:  # la tienda nunca muestra productos sin foto
            continue
        if hide_sold_out and sum(max(0, v.stock) for v in vs) <= 0:
            continue
        out.append(p)
    return out


def payload(root: str, api: str, open_id: int | None = None) -> dict:
    """Datos que la página necesita: negocio, departamentos y productos con sus variantes."""
    s = _settings()
    products = []
    for p in store_products(bool(s["store_hide_sold_out"])):
        vs = [v for v in p.variants if v.active]
        variants = [{"id": v.id, "label": " / ".join(str(x) for x in (v.attrs or {}).values() if x) or "Única",
                     "price": v.price_cents, "stock": max(0, v.stock)} for v in vs]
        products.append({
            "id": p.id, "slug": product_slug(p), "name": p.name, "desc": p.description or "",
            "dept": _root_name(p.category), "cat": p.category.name if p.category else "",
            "imgs": [f"{root}img/{ph.filename}" for ph in p.photos],
            "variants": variants, "price": min(v["price"] for v in variants), "priceMax": max(v["price"] for v in variants),
            "stock": sum(v["stock"] for v in variants), "url": f"{root}p/{product_slug(p)}/",
        })
    depts = []
    for pr in products:
        if pr["dept"] not in depts:
            depts.append(pr["dept"])
    wa = "".join(ch for ch in str(s["whatsapp"]) if ch.isdigit())
    if len(wa) == 10:
        wa = "52" + wa
    return {"root": root, "api": api, "open": open_id, "products": products, "depts": depts,
            "biz": {"name": s["business_name"], "whatsapp": wa}}


def render_page(root: str, api: str, origin: str, product: Product | None = None, data: dict | None = None) -> str:
    """HTML de la portada o de un producto, con su vista previa (Open Graph) para WhatsApp y Facebook."""
    s = _settings()
    data = dict(data or payload(root, api))
    data["open"] = product.id if product else None
    origin = origin.rstrip("/")
    tagline = [x.strip() for x in str(s["store_tagline"]).split("\n") if x.strip()] or [s["business_name"]]
    biz = {"name": s["business_name"], "subtitle": s["business_subtitle"], "address": s["address"],
           "hours": s["business_hours"], "whatsapp": s["whatsapp"], "intro": s["store_intro"], "tagline_lines": tagline,
           "payment_note": "Pagas al recoger o al recibir: efectivo, tarjeta o transferencia."}
    view = None
    if product:
        info = next((x for x in data["products"] if x["id"] == product.id), None)
        if info:
            view = {"name": info["name"], "price": info["price"], "stock": info["stock"]}
            price = f"${info['price'] / 100:,.2f}".replace(".00", "")
            title = f"{info['name']} · {price} · {biz['name']}"
            desc = (info["desc"] or f"{info['dept']} · {info['cat']}")[:180]
            desc = f"{price} · " + ("Agotado por ahora. " if info["stock"] <= 0 else "Disponible. ") + desc
            url = f"{origin}{root}p/{info['slug']}/"
            image = f"{origin}{root}og/{product.id}.jpg"
    if not view:
        title = f"{biz['name']} · Tienda en línea"
        desc = (biz["intro"] or "Catálogo con precios y existencias. Pide por WhatsApp.")[:200]
        url = f"{origin}{root}"
        first = data["products"][0] if data["products"] else None
        image = f"{origin}{root}og/{first['id']}.jpg" if first else None
    data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return render_template("tienda.html", root=root, biz=biz, product=view, page_title=title, page_description=desc,
                           page_url=url, page_image=image, data_json=data_json, asset_version=asset_version())


def og_image(photo_path: Path) -> bytes:
    """Imagen 1200×630 en JPEG (la aceptan todas las redes) a partir de la foto del producto."""
    with Image.open(photo_path) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        canvas = Image.new("RGB", OG_SIZE, (244, 243, 241))
        fit = ImageOps.contain(im, (OG_SIZE[0] - 80, OG_SIZE[1] - 40))
        canvas.paste(fit, ((OG_SIZE[0] - fit.width) // 2, (OG_SIZE[1] - fit.height) // 2))
        out = io.BytesIO()
        canvas.save(out, "JPEG", quality=82)
        return out.getvalue()


def _upload_dir() -> Path:
    return Path(current_app.config["UPLOAD_DIR"])


def _store_product(product_id: int) -> Product | None:
    s = _settings()
    return next((p for p in store_products(bool(s["store_hide_sold_out"])) if p.id == product_id), None)


# ---------------- rutas públicas (sin sesión) ----------------

@bp.get("")
def bare():
    return redirect("/tienda/", 301)


@bp.get("/")
def home():
    return render_page("/tienda/", "/tienda/api/", request.url_root)


@bp.get("/p/<slug>/")
@bp.get("/p/<slug>")
def product_page(slug: str):
    pid = slug.rsplit("-", 1)[-1]
    p = _store_product(int(pid)) if pid.isdigit() else None
    if not p:
        return render_template("cerrado.html", root="/tienda/", title="Producto no disponible",
                               text="Este producto ya no está en la tienda.", asset_version=asset_version()), 404
    if slug != product_slug(p):
        return redirect(f"/tienda/p/{product_slug(p)}/", 301)
    return render_page("/tienda/", "/tienda/api/", request.url_root, product=p)


@bp.get("/<any('tienda.css','tienda.js','logo.webp'):name>")
def asset(name: str):
    return send_from_directory(STATIC, name, max_age=3600)


@bp.get("/fonts/<name>")
def font(name: str):
    return send_from_directory(STATIC / "fonts", name, max_age=86400 * 30)


@bp.get("/img/<name>")
def image(name: str):
    """Solo se publican fotos de productos que están en la tienda (las demás siguen privadas)."""
    ph = session.scalars(select(ProductPhoto).where(ProductPhoto.filename == name)).first()
    if not ph or not _store_product(ph.product_id):
        abort(404)
    return send_from_directory(_upload_dir(), name, max_age=3600)


@bp.get("/og/<int:product_id>.jpg")
def og(product_id: int):
    p = _store_product(product_id)
    if not p:
        abort(404)
    path = _upload_dir() / p.photos[0].filename
    if not path.is_file():
        abort(404)
    return send_file(io.BytesIO(og_image(path)), mimetype="image/jpeg", max_age=3600)


# --- pedidos: límite por IP para que nadie llene el sistema de pedidos falsos ---
_hits: dict[str, deque] = defaultdict(deque)
MAX_ORDERS = 8
WINDOW_S = 600


def _too_many(ip: str) -> bool:
    now = time.monotonic()
    q = _hits[ip]
    while q and now - q[0] > WINDOW_S:
        q.popleft()
    if len(q) >= current_app.config.get("STORE_ORDER_LIMIT", MAX_ORDERS):
        return True
    q.append(now)
    return False


@bp.post("/api/pedido")
def new_order():
    from ..services import online_orders

    if _too_many(request.remote_addr or "?"):
        return fail("Hiciste muchos pedidos seguidos. Escríbenos por WhatsApp.", 429)
    if request.content_length and request.content_length > 20_000:
        return fail("Pedido demasiado grande.", 400)
    o, _created = online_orders.intake(request.get_json(silent=True) or {}, source="local")
    return ok("Pedido recibido.", 201, folio=o.folio, id=o.id)


def init_app(app) -> None:
    from .. import csrf

    csrf.exempt(bp)
    app.register_blueprint(bp)
