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
