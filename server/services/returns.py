"""Devoluciones parciales: reembolso de lo pagado por esas piezas, regreso de stock y resta de puntos."""
from __future__ import annotations

import re
import uuid

from sqlalchemy import func

from ..api_util import ConflictError, ValidationError, strict_int
from ..db import begin_write, session
from ..models import Client, Return, ReturnItem, Sale, SaleItem
from . import payments as pay
from .inventory import move
from .sales import NotAllowed, NotFound, points_for

ID_RE = re.compile(r"^[A-Za-z0-9-]{8,36}$")
REFUND_METHODS = {"cash", "card", "transfer", "credit"}


def returned_qty(sale_item_id: int) -> int:
    return int(session.query(func.coalesce(func.sum(ReturnItem.qty), 0))
               .filter(ReturnItem.sale_item_id == sale_item_id).scalar())


def line_values(sale: Sale) -> dict[int, int]:
    """Lo pagado por cada renglón: precio − descuento del renglón − su parte del descuento general."""
    nets = {it.id: it.unit_price_cents * it.qty - it.discount_cents for it in sale.items}
    general = sale.discount_cents - sum(it.discount_cents for it in sale.items)
    base = sum(nets.values())
    if general <= 0 or base <= 0:
        return nets
    return {k: v - (general * v) // base for k, v in nets.items()}


def create_return(sale_id: str, payload: dict, user) -> Return:
    if user.role != "admin":
        raise NotAllowed("Solo el administrador puede registrar devoluciones.")
    rid = str(payload.get("id") or uuid.uuid4())
    if not ID_RE.match(rid):
        raise ValidationError("Identificador no válido.", "id")
    reason = str(payload.get("reason") or "").strip()
    if not reason:
        raise ValidationError("Escribe el motivo de la devolución.", "reason")
    method = payload.get("refund_method")
    if method not in REFUND_METHODS:
        raise ValidationError("Elige cómo se devuelve el dinero.", "refund_method")
    raw = payload.get("items")
    if not isinstance(raw, list) or not raw or not all(isinstance(x, dict) for x in raw):
        raise ValidationError("Elige qué piezas se devuelven.", "items")
    begin_write()
    try:
        if session.get(Return, rid):
            return session.get(Return, rid)
        sale = session.get(Sale, sale_id)
        if not sale:
            raise NotFound("La venta no existe.")
        if sale.status == "cancelled":
            raise ConflictError("Esta venta está cancelada; no admite devoluciones.")
        if method == "credit" and not sale.client_id:
            raise ValidationError("Esta venta no tiene cliente; elige otra forma de reembolso.", "refund_method")
        values = line_values(sale)
        by_id = {it.id: it for it in sale.items}
        rows, refund = [], 0
        for x in raw:
            it = by_id.get(strict_int(x.get("sale_item_id"), "sale_item_id"))
            if it is None:
                raise ValidationError("Esa pieza no pertenece a la venta.", "items")
            qty = strict_int(x.get("qty"), "qty", 1)
            left = it.qty - returned_qty(it.id)
            if qty > left:
                raise ValidationError(f"Solo quedan {left} piezas por devolver de {it.variant.product.name}.", "items")
            amount = values[it.id] * qty // it.qty
            rows.append((it, qty, amount))
            refund += amount
        ret = Return(id=rid, sale_id=sale.id, user_id=user.id, reason=reason[:500], refund_method=method,
                     refund_cents=refund, cash_session_id=pay.cash_session_for_out(method, user.id))
        session.add(ret)
        session.flush()
        for it, qty, amount in rows:
            session.add(ReturnItem(return_id=rid, sale_item_id=it.id, qty=qty, refund_cents=amount))
            move(it.variant_id, qty, "return", user.id, reason, ref_type="return", ref_id=rid)
        if sale.client_id:
            c = session.get(Client, sale.client_id)
            c.points = max(0, c.points - points_for(refund))
            if method == "credit":
                c.credit_cents += refund
        session.commit()
        return ret
    except Exception:
        session.rollback()
        raise


def return_dict(r: Return) -> dict:
    return {"id": r.id, "sale_id": r.sale_id, "refund_method": r.refund_method, "refund_cents": r.refund_cents,
            "reason": r.reason, "created_at": r.created_at.isoformat(),
            "items": [{"sale_item_id": i.sale_item_id, "qty": i.qty, "refund_cents": i.refund_cents} for i in r.items]}
