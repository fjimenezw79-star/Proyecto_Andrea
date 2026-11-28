"""/api/sales/<id>/returns: devoluciones parciales (solo administrador)."""
from __future__ import annotations

from flask import Blueprint, request
from flask_login import current_user, login_required

from ..api_util import fail, ok
from ..services import returns, sales

bp = Blueprint("returns", __name__, url_prefix="/api/sales")


@bp.errorhandler(sales.NotFound)
def _missing(e):
    return fail(e.message, 404)


@bp.errorhandler(sales.NotAllowed)
def _forbidden(e):
    return fail(e.message, 403)


@bp.post("/<sale_id>/returns")
@login_required
def create(sale_id: str):
    r = returns.create_return(sale_id, request.get_json(silent=True) or {}, current_user)
    return ok("Devolución registrada.", 201, **{"return": returns.return_dict(r)})
