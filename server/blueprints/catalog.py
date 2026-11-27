"""/api/categories, /api/products y /api/variants."""
from __future__ import annotations

from flask import Blueprint, request
from flask_login import login_required

from ..api_util import ok
from ..security import admin_required
from ..services import catalog

bp = Blueprint("catalog", __name__, url_prefix="/api")


@bp.get("/categories")
@login_required
def list_categories():
    return ok(categories=catalog.category_tree())


@bp.post("/categories")
@admin_required
def create_category():
    d = request.get_json(silent=True) or {}
    c = catalog.create_category(d.get("name"), d.get("parent_id"))
    return ok("Categoría creada.", 201, category=catalog.category_dict(c))


@bp.patch("/categories/<int:category_id>")
@admin_required
def update_category(category_id: int):
    c = catalog.update_category(category_id, request.get_json(silent=True) or {})
    return ok("Categoría actualizada.", category=catalog.category_dict(c))


import json  # noqa: E402

from flask import current_app, send_from_directory  # noqa: E402
from flask_login import current_user  # noqa: E402

from ..api_util import ValidationError, fail  # noqa: E402


def _is_admin() -> bool:
    return bool(current_user.is_authenticated and current_user.is_admin)


def _product_json(p, status=200, message=""):
    return ok(message, status, product=catalog.product_dict(p, with_cost=_is_admin()))


@bp.post("/products")
@admin_required
def create_product():
    try:
        data = json.loads(request.form.get("data") or "{}")
    except ValueError:
        raise ValidationError("Datos del producto no válidos.", "data") from None
    if not isinstance(data, dict):
        raise ValidationError("Datos del producto no válidos.", "data")
    p = catalog.create_product(data, request.files.getlist("photos"), current_user)
    return _product_json(p, 201, "Producto creado.")


@bp.get("/products")
@login_required
def list_products():
    online = request.args.get("online")
    items, total = catalog.list_products(
        q=request.args.get("q", ""), category_id=request.args.get("category", type=int),
        online=None if online in (None, "") else online.lower() in ("1", "true", "si", "sí"),
        page=request.args.get("page", 1, type=int))
    return ok(products=[catalog.product_dict(p, _is_admin()) for p in items], total=total,
              page_size=catalog.PAGE_SIZE)


@bp.get("/products/<int:product_id>")
@login_required
def get_product(product_id: int):
    return _product_json(catalog.get_product(product_id))


@bp.patch("/products/<int:product_id>")
@admin_required
def update_product(product_id: int):
    return _product_json(catalog.update_product(product_id, request.get_json(silent=True) or {}), 200,
                         "Producto actualizado.")


@bp.post("/products/<int:product_id>/photos")
@admin_required
def add_photos(product_id: int):
    return _product_json(catalog.add_photos(product_id, request.files.getlist("photos")), 200, "Foto agregada.")


@bp.delete("/products/<int:product_id>/photos/<int:photo_id>")
@admin_required
def delete_photo(product_id: int, photo_id: int):
    return _product_json(catalog.delete_photo(product_id, photo_id), 200, "Foto eliminada.")


@bp.patch("/variants/<int:variant_id>")
@admin_required
def update_variant(variant_id: int):
    v = catalog.update_variant(variant_id, request.get_json(silent=True) or {})
    return ok("Variante actualizada.", variant=catalog.variant_dict(v, True))


@bp.get("/variants/lookup")
@login_required
def lookup():
    try:
        v = catalog.lookup(request.args.get("code", ""))
    except LookupError as e:
        return fail(str(e), 404)
    return ok(variant=catalog.variant_dict(v, _is_admin()), product=catalog.product_dict(v.product, _is_admin()))


uploads = Blueprint("uploads", __name__)


@uploads.get("/uploads/<path:filename>")
@login_required
def uploaded(filename: str):
    return send_from_directory(current_app.config["UPLOAD_DIR"], filename, max_age=86400)
