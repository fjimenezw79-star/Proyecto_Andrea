"""Ventas: carrito con varias piezas, pagos mixtos, descuentos por rol y cancelación."""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime

from flask import current_app
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from ..api_util import ConflictError, ValidationError, strict_int
from ..db import begin_write, session
from ..models import Client, Return, Sale, SaleItem, SalePayment, User, Variant
from ..offline import event_time, is_offline
from . import payments as pay
from .inventory import InsufficientStock, move

ID_RE = re.compile(r"^[A-Za-z0-9-]{8,36}$")


class NotFound(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotAllowed(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _int(value, field: str, minimum: int | None = None) -> int:
    return strict_int(value, field, minimum)


def _variant_label(v: Variant) -> str:
    attrs = ", ".join(v.attrs.values()) if v.attrs else ""
    return f"{v.product.name} ({attrs})" if attrs else v.product.name


def _points(total_cents: int) -> int:
    return total_cents // (current_app.config["POINTS_PER_PESOS"] * 100)


def _next_folio() -> int:
    return (session.query(func.max(Sale.folio)).scalar() or 0) + 1


def parse_items(raw_items) -> list:
    if not isinstance(raw_items, list) or not all(isinstance(it, dict) for it in raw_items):
        raise ValidationError("Lista de productos no válida.", "items")
    if not raw_items:
        raise ValidationError("Agrega al menos un producto.", "items")
    return raw_items


def price_lines(raw_items: list, general_discount, user):
    """Precios del momento, descuentos y tope del vendedor. Devuelve (renglones, subtotal, descuento, total)."""
    lines, subtotal, item_disc = [], 0, 0
    for it in raw_items:
        v = session.get(Variant, _int(it.get("variant_id"), "variant_id"))
        if not v or not v.active:
            raise ValidationError("Uno de los productos ya no existe.", "items")
        qty = _int(it.get("qty"), "qty", 1)
        disc = _int(it.get("discount_cents", 0), "discount_cents", 0)
        gross = v.price_cents * qty
        if disc > gross:
            raise ValidationError("El descuento no puede ser mayor que el precio.", "discount_cents")
        lines.append((v, qty, disc))
        subtotal += gross
        item_disc += disc
    discount = item_disc + _int(general_discount or 0, "discount_cents", 0)
    if discount > subtotal:
        raise ValidationError("El descuento no puede ser mayor que el total.", "discount_cents")
    if user.role == "seller" and discount * 100 > subtotal * current_app.config["SELLER_MAX_DISCOUNT_PCT"]:
        raise NotAllowed("Ese descuento necesita autorización del administrador.")
    return lines, subtotal, discount, subtotal - discount


def points_for(total_cents: int) -> int:
    return _points(total_cents)


def label_insufficient(e: InsufficientStock, v: Variant) -> InsufficientStock:
    return _with_label(e, v)


def create_sale(payload: dict, user) -> Sale:
    sale_id = str(payload.get("id") or uuid.uuid4())
    if not ID_RE.match(sale_id):
        raise ValidationError("Identificador de venta no válido.", "id")
    existing = session.get(Sale, sale_id)
    if existing:
        return existing

    raw_items = parse_items(payload.get("items") or [])
    client_id = payload.get("client_id") or None
    if client_id and not session.get(Client, client_id):
        raise ValidationError("El cliente no existe.", "client_id")

    begin_write()
    try:
        existing = session.get(Sale, sale_id)  # otra petición con el mismo id pudo ganar la carrera
        if existing:
            return existing
        lines, subtotal, discount, total = price_lines(raw_items, payload.get("discount_cents", 0), user)

        parsed = pay.parse(payload.get("payments"), total, client_id)
        cash_session_id = pay.apply(parsed, client_id=client_id, user_id=user.id)

        sale = Sale(id=sale_id, folio=_next_folio(), created_at=event_time(), user_id=user.id, client_id=client_id, subtotal_cents=subtotal,
                    discount_cents=discount, total_cents=total, status="paid",
                    note=str(payload.get("note") or "").strip()[:500])
        session.add(sale)
        session.flush()
        for v, qty, disc in lines:
            try:
                move(v.id, -qty, "sale", user.id, ref_type="sale", ref_id=sale_id, allow_negative=is_offline())
            except InsufficientStock as e:
                raise _with_label(e, v) from None
            session.add(SaleItem(sale_id=sale_id, variant_id=v.id, qty=qty, unit_price_cents=v.price_cents,
                                 unit_cost_cents=v.cost_cents, discount_cents=disc))
        for p in parsed:
            session.add(SalePayment(sale_id=sale_id, method=p.method, amount_cents=p.amount_cents,
                                    received_cents=p.received_cents,
                                    cash_session_id=cash_session_id))
        if client_id:
            session.get(Client, client_id).points += _points(total)
        session.commit()
        return sale
    except IntegrityError:
        session.rollback()
        existing = session.get(Sale, sale_id)
        if existing:
            return existing
        raise
    except Exception:
        session.rollback()
        raise


def _with_label(e: InsufficientStock, v: Variant) -> InsufficientStock:
    err = InsufficientStock(v.id, e.available)
    err.message = f"No hay suficientes piezas de {_variant_label(v)}. Quedan {e.available}."
    err.args = (err.message,)
    return err


def cancel_sale(sale_id: str, user, reason: str) -> Sale:
    if user.role != "admin":
        raise NotAllowed("Solo el administrador puede cancelar ventas.")
    reason = (reason or "").strip()
    if not reason:
        raise ValidationError("Escribe el motivo de la cancelación.", "reason")
    sale = session.get(Sale, sale_id)
    if not sale:
        raise NotFound("La venta no existe.")
    begin_write()
    try:
        sale = session.get(Sale, sale_id)
        if sale.status == "cancelled":
            raise ConflictError("Esta venta ya estaba cancelada.")
        if sale.source == "layaway":
            raise ConflictError("Esta venta viene de un apartado liquidado; registra una devolución de piezas.")
        if session.query(Return).filter(Return.sale_id == sale.id).first():
            raise ConflictError("Esta venta ya tiene devoluciones; registra la devolución de las piezas restantes.")
        for it in sale.items:
            move(it.variant_id, it.qty, "sale_cancel", user.id, reason, ref_type="sale", ref_id=sale.id)
        if sale.client_id:
            c = session.get(Client, sale.client_id)
            c.points = max(0, c.points - _points(sale.total_cents))
            c.credit_cents += sum(p.amount_cents for p in sale.payments if p.method == "credit")
        if any(p.method == "cash" for p in sale.payments):
            from .cash import current_or_auto
            sale.cancel_cash_session_id = current_or_auto(user.id)  # el efectivo sale de la caja de hoy
        sale.status = "cancelled"
        sale.cancelled_at = datetime.now().replace(microsecond=0)
        sale.cancelled_by = user.id
        sale.cancel_reason = reason[:500]
        session.commit()
    except Exception:
        session.rollback()
        raise
    return sale


def get_sale(sale_id: str) -> Sale:
    sale = session.get(Sale, sale_id)
    if not sale:
        raise NotFound("La venta no existe.")
    return sale


def list_sales(day: date) -> list[Sale]:
    start = datetime.combine(day, datetime.min.time())
    end = datetime.combine(day, datetime.max.time())
    return session.query(Sale).filter(Sale.created_at.between(start, end)).order_by(Sale.folio.desc()).all()


def _returned(sale_item_id: int) -> int:
    from .returns import returned_qty
    return returned_qty(sale_item_id)


def sale_dict(s: Sale, with_cost: bool) -> dict:
    items = []
    for it in s.items:
        d = {"id": it.id, "returned_qty": _returned(it.id), "variant_id": it.variant_id, "sku": it.variant.sku, "name": it.variant.product.name,
             "attrs": it.variant.attrs or {}, "qty": it.qty, "unit_price_cents": it.unit_price_cents,
             "discount_cents": it.discount_cents}
        if with_cost:
            d["unit_cost_cents"] = it.unit_cost_cents
        items.append(d)
    pays = [{"method": p.method, "amount_cents": p.amount_cents, "received_cents": p.received_cents} for p in s.payments]
    change = sum((p.received_cents or 0) - p.amount_cents for p in s.payments if p.method == "cash")
    seller = session.get(User, s.user_id)
    client = session.get(Client, s.client_id) if s.client_id else None
    return {"id": s.id, "folio": s.folio, "status": s.status, "user_id": s.user_id, "client_id": s.client_id,
            "user_name": (seller.full_name or seller.username) if seller else None,
            "client_name": client.name if client else None, "client_phone": client.phone if client else None,
            "subtotal_cents": s.subtotal_cents, "discount_cents": s.discount_cents, "total_cents": s.total_cents,
            "change_cents": change, "shipping_cents": s.shipping_cents or 0, "note": s.note, "created_at": s.created_at.isoformat(),
            "cancel_reason": s.cancel_reason or None, "items": items, "payments": pays, "source": s.source,
            "fully_returned": bool(items) and all(i["returned_qty"] >= i["qty"] for i in items),
            "returns": [{"id": r.id, "refund_cents": r.refund_cents, "refund_method": r.refund_method, "reason": r.reason,
                         "created_at": r.created_at.isoformat()}
                        for r in session.query(Return).filter(Return.sale_id == s.id).order_by(Return.created_at)]}
