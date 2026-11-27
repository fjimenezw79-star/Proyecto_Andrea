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
