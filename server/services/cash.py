"""Caja: sesiones por turno y efectivo esperado."""
from __future__ import annotations

from ..db import session
from ..models import CashSession


def current() -> CashSession | None:
    return session.query(CashSession).filter(CashSession.closed_at.is_(None)).order_by(CashSession.id.desc()).first()


def current_or_auto(user_id: int) -> int:
    """Id de la caja abierta; si no hay, abre una con fondo $0 (no se frena una venta). No hace commit."""
    cs = current()
    if cs is None:
        cs = CashSession(opened_by=user_id, opening_cents=0, auto=True, notes="Abierta automáticamente")
        session.add(cs)
        session.flush()
    return cs.id


# ---------------------------------------------------------------------------
# Resumen, apertura y corte
# ---------------------------------------------------------------------------
from datetime import datetime  # noqa: E402

from sqlalchemy import and_, func, or_  # noqa: E402

from ..api_util import ConflictError, strict_int  # noqa: E402
from ..db import begin_write  # noqa: E402
from ..models import Expense, Layaway, LayawayPayment, Return, Sale, SalePayment, User  # noqa: E402


def open_(opening_cents, user_id: int) -> CashSession:
    opening = strict_int(opening_cents, "opening_cents", 0)
    begin_write()
    if current():
        session.rollback()
        raise ConflictError("Ya hay una caja abierta. Haz el corte antes de abrir otra.")
    cs = CashSession(opened_by=user_id, opening_cents=opening)
    session.add(cs)
    session.commit()
    return cs


def summary(cs: CashSession) -> dict:
    sid = cs.id
    end = cs.closed_at or datetime.now()
    movements = []
    cash_sales = 0
    for p, s in (session.query(SalePayment, Sale).join(Sale, Sale.id == SalePayment.sale_id)
                 .filter(SalePayment.cash_session_id == sid, SalePayment.method == "cash")):
        cash_sales += p.amount_cents
        movements.append({"at": s.created_at, "kind": "Venta", "ref": f"#{s.folio}", "amount_cents": p.amount_cents})
    lay_cash = 0
    for p, l in (session.query(LayawayPayment, Layaway).join(Layaway, Layaway.id == LayawayPayment.layaway_id)
                 .filter(LayawayPayment.cash_session_id == sid, LayawayPayment.method == "cash")):
        lay_cash += p.amount_cents
        movements.append({"at": p.created_at, "kind": "Abono de apartado", "ref": f"#{l.folio}", "amount_cents": p.amount_cents})
    refunds = 0
    for r, s in (session.query(Return, Sale).join(Sale, Sale.id == Return.sale_id)
                 .filter(Return.cash_session_id == sid, Return.refund_method == "cash")):
        refunds += r.refund_cents
        movements.append({"at": r.created_at, "kind": "Devolución", "ref": f"Venta #{s.folio}", "amount_cents": -r.refund_cents})
    for l in session.query(Layaway).filter(Layaway.refund_cash_session_id == sid):
        refunds += l.paid_cents
        movements.append({"at": l.cancelled_at, "kind": "Reembolso de apartado", "ref": f"#{l.folio}", "amount_cents": -l.paid_cents})
    for s in session.query(Sale).filter(Sale.cancel_cash_session_id == sid):
        back = sum(p.amount_cents for p in s.payments if p.method == "cash")
        if back:
            refunds += back
            movements.append({"at": s.cancelled_at, "kind": "Venta cancelada", "ref": f"#{s.folio}", "amount_cents": -back})
    expenses = 0
    for e in session.query(Expense).filter(Expense.cash_session_id == sid):
        expenses += e.amount_cents
        movements.append({"at": e.created_at, "kind": "Gasto", "ref": e.description, "amount_cents": -e.amount_cents})

    def by_method(method: str) -> int:
        # Por la caja que recibió el pago; los registros anteriores a la etapa 4 (sin caja) por su fecha.
        in_sale = or_(SalePayment.cash_session_id == sid,
                      and_(SalePayment.cash_session_id.is_(None), Sale.created_at.between(cs.opened_at, end)))
        in_lay = or_(LayawayPayment.cash_session_id == sid,
                     and_(LayawayPayment.cash_session_id.is_(None), LayawayPayment.created_at.between(cs.opened_at, end)))
        a = (session.query(func.coalesce(func.sum(SalePayment.amount_cents), 0)).join(Sale, Sale.id == SalePayment.sale_id)
             .filter(SalePayment.method == method, Sale.status == "paid", in_sale).scalar())
        b = (session.query(func.coalesce(func.sum(LayawayPayment.amount_cents), 0))
             .filter(LayawayPayment.method == method, in_lay).scalar())
        return int(a) + int(b)

    movements.sort(key=lambda m: m["at"])
    expected = cs.opening_cents + cash_sales + lay_cash - refunds - expenses
    return {"opening_cents": cs.opening_cents, "cash_sales_cents": cash_sales, "layaway_cash_cents": lay_cash,
            "refunds_cash_cents": refunds, "expenses_cash_cents": expenses, "expected_cents": expected,
            "card_cents": by_method("card"), "transfer_cents": by_method("transfer"), "credit_cents": by_method("credit"),
            "movements": [{**m, "at": m["at"].isoformat()} for m in movements]}


def close(counted_cents, notes: str, user_id: int) -> CashSession:
    counted = strict_int(counted_cents, "counted_cents", 0)
    begin_write()
    cs = current()
    if cs is None:
        session.rollback()
        raise ConflictError("No hay caja abierta.")
    s = summary(cs)
    cs.counted_cents = counted
    cs.expected_cents = s["expected_cents"]
    cs.difference_cents = counted - s["expected_cents"]
    cs.closed_by = user_id
    cs.closed_at = datetime.now().replace(microsecond=0)
    extra = str(notes or "").strip()[:500]
    if extra:
        cs.notes = f"{cs.notes} · {extra}" if cs.notes else extra
    session.commit()
    return cs


def session_dict(cs: CashSession | None) -> dict | None:
    if cs is None:
        return None
    names = {u.id: (u.full_name or u.username) for u in session.query(User).all()}
    return {"id": cs.id, "opened_by": names.get(cs.opened_by), "opened_at": cs.opened_at.isoformat(),
            "opening_cents": cs.opening_cents, "auto": cs.auto, "closed_by": names.get(cs.closed_by),
            "closed_at": cs.closed_at.isoformat() if cs.closed_at else None, "counted_cents": cs.counted_cents,
            "expected_cents": cs.expected_cents, "difference_cents": cs.difference_cents, "notes": cs.notes}


def history(limit: int = 60) -> list[CashSession]:
    return session.query(CashSession).filter(CashSession.closed_at.isnot(None)).order_by(CashSession.id.desc()).limit(limit).all()

