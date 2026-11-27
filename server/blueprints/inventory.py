"""/api/inventory: entradas, ajustes, bitácora y stock bajo."""
from __future__ import annotations

from flask import Blueprint, request
from flask_login import current_user, login_required

from ..api_util import ok
from ..blueprints.settings import get_settings
from ..security import admin_required
from ..services import catalog, inventory

bp = Blueprint("inventory", __name__, url_prefix="/api/inventory")


@bp.post("/entries")
@admin_required
def entries():
    d = request.get_json(silent=True) or {}
    mv = inventory.add_entries(d.get("items") or [], d.get("note", ""), current_user.id)
    return ok("Entrada registrada.", movements=[inventory.movement_dict(m) for m in mv])


@bp.post("/adjustments")
@admin_required
def adjustments():
    d = request.get_json(silent=True) or {}
    mv = inventory.adjust(d.get("variant_id"), d.get("new_stock"), d.get("note", ""), current_user.id)
    return ok("Ajuste registrado." if mv else "El stock ya era ese; no hubo cambios.",
              movement=inventory.movement_dict(mv) if mv else None)


@bp.get("/movements")
@login_required
def movements():
    mv = inventory.movements(request.args.get("variant_id", type=int), request.args.get("page", 1, type=int))
    return ok(movements=[inventory.movement_dict(m) for m in mv])


@bp.get("/low-stock")
@login_required
def low_stock():
    rows = inventory.low_stock(int(get_settings()["low_stock_threshold"]))
    admin = current_user.is_admin
    return ok(variants=[{**catalog.variant_dict(v, admin), "product_id": v.product_id, "product": v.product.name}
                        for v in rows])
