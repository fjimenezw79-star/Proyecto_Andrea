"""Inventario: el stock solo cambia mediante movimientos registrados."""
from __future__ import annotations

from sqlalchemy import update

from ..api_util import ConflictError, ValidationError, strict_int
from ..db import begin_write, session
from ..models import StockMovement, Variant

REASONS = {"sale", "sale_cancel", "purchase", "adjustment", "import"}


class InsufficientStock(ConflictError):
    def __init__(self, variant_id: int, available: int):
        super().__init__(f"No hay suficientes piezas. Quedan {available}.", variant_id=variant_id)
        self.variant_id = variant_id
        self.available = available


def move(variant_id: int, qty_delta: int, reason: str, user_id: int | None, note: str = "",
         ref_type: str | None = None, ref_id: str | None = None) -> StockMovement:
    """Aplica un movimiento de stock sin hacer commit (lo hace quien llama)."""
    if reason not in REASONS:
        raise ValueError(f"Razón de movimiento desconocida: {reason}")
    if qty_delta == 0:
        raise ValidationError("La cantidad no puede ser cero.", "qty")
    res = session.execute(update(Variant).where(Variant.id == variant_id, Variant.stock + qty_delta >= 0)
                          .values(stock=Variant.stock + qty_delta).execution_options(synchronize_session="fetch"))
    if res.rowcount != 1:
        v = session.get(Variant, variant_id)
        if v is None:
            raise ValidationError("El producto no existe.", "variant_id")
        raise InsufficientStock(variant_id, v.stock)
    mv = StockMovement(variant_id=variant_id, qty_delta=qty_delta, reason=reason, user_id=user_id,
                       note=(note or "").strip()[:500], ref_type=ref_type, ref_id=ref_id)
    session.add(mv)
    return mv


def _int(value, field: str) -> int:
    return strict_int(value, field)


def add_entries(items: list, note: str, user_id: int) -> list[StockMovement]:
    if not items:
        raise ValidationError("Agrega al menos un producto a la entrada.", "items")
    if not isinstance(items, list) or not all(isinstance(it, dict) for it in items):
        raise ValidationError("Lista de productos no válida.", "items")
    out = []
    begin_write()
    try:
        for it in items:
            qty = _int(it.get("qty"), "qty")
            if qty <= 0:
                raise ValidationError("La cantidad debe ser mayor que cero.", "qty")
            vid = _int(it.get("variant_id"), "variant_id")
            if it.get("cost_cents") not in (None, ""):
                cost = _int(it["cost_cents"], "cost_cents")
                if cost < 0:
                    raise ValidationError("El costo no puede ser negativo.", "cost_cents")
                v = session.get(Variant, vid)
                if v:
                    v.cost_cents = cost
            out.append(move(vid, qty, "purchase", user_id, note))
        session.commit()
    except Exception:
        session.rollback()
        raise
    return out


def adjust(variant_id: int, new_stock, note: str, user_id: int) -> StockMovement | None:
    note = (note or "").strip()
    if not note:
        raise ValidationError("Escribe el motivo del ajuste.", "note")
    new_stock = _int(new_stock, "new_stock")
    if new_stock < 0:
        raise ValidationError("El stock no puede ser negativo.", "new_stock")
    v = session.get(Variant, _int(variant_id, "variant_id"))
    if not v:
        raise ValidationError("El producto no existe.", "variant_id")
    delta = new_stock - v.stock
    if delta == 0:
        return None
    begin_write()
    try:
        mv = move(v.id, delta, "adjustment", user_id, note)
        session.commit()
    except Exception:
        session.rollback()
        raise
    return mv


def movement_dict(m: StockMovement) -> dict:
    return {"id": m.id, "variant_id": m.variant_id, "qty_delta": m.qty_delta, "reason": m.reason,
            "ref_type": m.ref_type, "ref_id": m.ref_id, "user_id": m.user_id, "note": m.note,
            "created_at": m.created_at.isoformat()}


def movements(variant_id: int | None = None, page: int = 1, size: int = 100) -> list[StockMovement]:
    q = session.query(StockMovement)
    if variant_id:
        q = q.filter(StockMovement.variant_id == variant_id)
    return q.order_by(StockMovement.id.desc()).offset((max(page, 1) - 1) * size).limit(size).all()


def low_stock(threshold: int) -> list[Variant]:
    return (session.query(Variant).filter(Variant.active.is_(True), Variant.stock <= threshold)
            .order_by(Variant.stock, Variant.id).all())
