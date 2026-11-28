"""/api/expenses: gastos del negocio (solo administrador)."""
from __future__ import annotations

from datetime import date

from flask import Blueprint, request
from flask_login import current_user

from ..api_util import fail, ok
from ..security import admin_required
from ..services import expenses

bp = Blueprint("expenses", __name__, url_prefix="/api/expenses")


@bp.errorhandler(expenses.NotFound)
def _missing(e):
    return fail(e.message, 404)


def _date(name: str, default: date) -> date:
    v = request.args.get(name)
    try:
        return date.fromisoformat(v) if v else default
    except ValueError:
        return default


@bp.get("")
@admin_required
def list_():
    today = date.today()
    start = _date("from", today.replace(day=1))
    end = _date("to", today)
    return ok(expenses=[expenses.expense_dict(e) for e in expenses.list_(start, end)], categories=expenses.CATEGORIES)


@bp.post("")
@admin_required
def create():
    e = expenses.create(request.get_json(silent=True) or {}, current_user.id)
    return ok("Gasto registrado.", 201, expense=expenses.expense_dict(e))


@bp.patch("/<int:expense_id>")
@admin_required
def update(expense_id: int):
    return ok("Gasto actualizado.", expense=expenses.expense_dict(expenses.update(expense_id, request.get_json(silent=True) or {})))


@bp.delete("/<int:expense_id>")
@admin_required
def delete(expense_id: int):
    expenses.delete(expense_id)
    return ok("Gasto eliminado.")
