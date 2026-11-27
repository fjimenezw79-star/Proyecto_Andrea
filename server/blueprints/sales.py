"""/api/sales: cobrar, consultar y cancelar ventas."""
from __future__ import annotations

from datetime import date

from flask import Blueprint, request
from flask_login import current_user, login_required

from ..api_util import fail, ok
from ..services import sales

bp = Blueprint("sales", __name__, url_prefix="/api/sales")


@bp.errorhandler(sales.NotAllowed)
def _not_allowed(e):
    return fail(e.message, 403)


@bp.errorhandler(LookupError)
def _missing(e):
    return fail(str(e), 404)


@bp.post("")
@login_required
def create():
    s = sales.create_sale(request.get_json(silent=True) or {}, current_user)
    return ok("Venta registrada.", 201, sale=sales.sale_dict(s, current_user.is_admin))


@bp.get("")
@login_required
def list_():
    try:
        day = date.fromisoformat(request.args.get("date") or date.today().isoformat())
    except ValueError:
        return fail("Fecha no válida (usa AAAA-MM-DD).", 400, "date")
    return ok(sales=[sales.sale_dict(s, current_user.is_admin) for s in sales.list_sales(day)])


@bp.get("/<sale_id>")
@login_required
def get(sale_id: str):
    return ok(sale=sales.sale_dict(sales.get_sale(sale_id), current_user.is_admin))


@bp.post("/<sale_id>/cancel")
@login_required
def cancel(sale_id: str):
    d = request.get_json(silent=True) or {}
    s = sales.cancel_sale(sale_id, current_user, d.get("reason", ""))
    return ok("Venta cancelada.", sale=sales.sale_dict(s, current_user.is_admin))
