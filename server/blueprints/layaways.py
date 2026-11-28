"""/api/layaways: apartados con anticipo, abonos, liquidación y cancelación."""
from __future__ import annotations

from flask import Blueprint, request
from flask_login import current_user, login_required

from ..api_util import fail, ok
from ..services import layaways, sales

bp = Blueprint("layaways", __name__, url_prefix="/api/layaways")


@bp.errorhandler(layaways.NotFound)
def _missing(e):
    return fail(e.message, 404)


@bp.errorhandler(sales.NotAllowed)
def _forbidden(e):
    return fail(e.message, 403)


def _body():
    return request.get_json(silent=True) or {}


@bp.get("")
@login_required
def list_():
    names = layaways.user_names()
    return ok(layaways=[layaways.layaway_dict(l, names) for l in layaways.list_(request.args.get("status"))])


@bp.get("/<layaway_id>")
@login_required
def get(layaway_id: str):
    return ok(layaway=layaways.layaway_dict(layaways.get(layaway_id)))


@bp.post("")
@login_required
def create():
    l = layaways.create(_body(), current_user)
    return ok("Apartado registrado.", 201, layaway=layaways.layaway_dict(l))


@bp.post("/<layaway_id>/payments")
@login_required
def payment(layaway_id: str):
    l = layaways.add_payment(layaway_id, _body(), current_user)
    return ok("Abono registrado.", layaway=layaways.layaway_dict(l))


@bp.post("/<layaway_id>/settle")
@login_required
def settle(layaway_id: str):
    l, s = layaways.settle(layaway_id, _body(), current_user)
    return ok("Apartado liquidado.", layaway=layaways.layaway_dict(l), sale=sales.sale_dict(s, current_user.is_admin))


@bp.post("/<layaway_id>/cancel")
@login_required
def cancel(layaway_id: str):
    l = layaways.cancel(layaway_id, _body(), current_user)
    return ok("Apartado cancelado.", layaway=layaways.layaway_dict(l))
