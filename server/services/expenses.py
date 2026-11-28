"""Gastos del negocio; los pagados con dinero de la caja salen del efectivo esperado."""
from __future__ import annotations

from datetime import date

from ..api_util import ConflictError, ValidationError, strict_int
from ..db import begin_write, session
from ..models import CashSession, Expense
from . import cash

CATEGORIES = ["Renta", "Luz e internet", "Sueldos", "Mercancía", "Insumos", "Otros"]


class NotFound(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _desc(v) -> str:
    d = str(v or "").strip()
    if not d:
        raise ValidationError("Escribe en qué se gastó.", "description")
    return d[:200]


def _cat(v) -> str:
    if v not in CATEGORIES:
        raise ValidationError("Elige una categoría de la lista.", "category")
    return v


def _day(v) -> date:
    if v in (None, ""):
        return date.today()
    try:
        return date.fromisoformat(str(v))
    except ValueError:
        raise ValidationError("Fecha no válida (usa AAAA-MM-DD).", "day") from None


def create(data: dict, user_id: int) -> Expense:
    e = Expense(description=_desc(data.get("description")), category=_cat(data.get("category")),
                amount_cents=strict_int(data.get("amount_cents"), "amount_cents", 1),
                from_register=bool(data.get("from_register")), day=_day(data.get("day")), user_id=user_id)
    begin_write()
    try:
        if e.from_register:
            e.cash_session_id = cash.current_or_auto(user_id)
        session.add(e)
        session.commit()
        return e
    except Exception:
        session.rollback()
        raise


def _locked(e: Expense) -> bool:
    if not e.cash_session_id:
        return False
    cs = session.get(CashSession, e.cash_session_id)
    return bool(cs and cs.closed_at)


def get(expense_id: int) -> Expense:
    e = session.get(Expense, expense_id)
    if not e:
        raise NotFound("El gasto no existe.")
    return e


def update(expense_id: int, data: dict) -> Expense:
    begin_write()
    e = get(expense_id)
    if _locked(e) and ("amount_cents" in data or "from_register" in data):
        session.rollback()
        raise ConflictError("Ese gasto salió de una caja ya cortada; no se puede cambiar el monto.")
    if "description" in data:
        e.description = _desc(data["description"])
    if "category" in data:
        e.category = _cat(data["category"])
    if "amount_cents" in data:
        e.amount_cents = strict_int(data["amount_cents"], "amount_cents", 1)
    if "day" in data:
        e.day = _day(data["day"])
    session.commit()
    return e


def delete(expense_id: int) -> None:
    begin_write()
    e = get(expense_id)
    if _locked(e):
        session.rollback()
        raise ConflictError("Ese gasto salió de una caja ya cortada; no se puede borrar.")
    session.delete(e)
    session.commit()


def list_(start: date, end: date) -> list[Expense]:
    return (session.query(Expense).filter(Expense.day.between(start, end))
            .order_by(Expense.day.desc(), Expense.id.desc()).all())


def expense_dict(e: Expense) -> dict:
    return {"id": e.id, "description": e.description, "category": e.category, "amount_cents": e.amount_cents,
            "from_register": e.from_register, "day": e.day.isoformat(), "locked": _locked(e)}
