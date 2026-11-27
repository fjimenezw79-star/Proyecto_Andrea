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
from ..models import Client, Sale, SaleItem, SalePayment, User, Variant
from .inventory import InsufficientStock, move

METHODS = {"cash", "card", "transfer"}
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


def create_sale(payload: dict, user) -> Sale:
    sale_id = str(payload.get("id") or uuid.uuid4())
    if not ID_RE.match(sale_id):
        raise ValidationError("Identificador de venta no válido.", "id")
    existing = session.get(Sale, sale_id)
    if existing:
        return existing

    raw_items = payload.get("items") or []
    if not isinstance(raw_items, list) or not all(isinstance(it, dict) for it in raw_items):
        raise ValidationError("Lista de productos no válida.", "items")
    if not raw_items:
        raise ValidationError("Agrega al menos un producto.", "items")
    client_id = payload.get("client_id") or None
    if client_id and not session.get(Client, client_id):
        raise ValidationError("El cliente no existe.", "client_id")

    begin_write()
    try:
        existing = session.get(Sale, sale_id)  # otra petición con el mismo id pudo ganar la carrera
        if existing:
            return existing
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
        general = _int(payload.get("discount_cents", 0), "discount_cents", 0)
        discount = item_disc + general
        if discount > subtotal:
            raise ValidationError("El descuento no puede ser mayor que el total.", "discount_cents")
        if user.role == "seller" and discount * 100 > subtotal * current_app.config["SELLER_MAX_DISCOUNT_PCT"]:
            raise NotAllowed("Ese descuento necesita autorización del administrador.")
        total = subtotal - discount

        pays = payload.get("payments") or []
        if not isinstance(pays, list) or not all(isinstance(p, dict) for p in pays):
            raise ValidationError("Formas de pago no válidas.", "payments")
        if not pays and total > 0:
            raise ValidationError("Agrega la forma de pago.", "payments")
        parsed = []
        for p in pays:
            method = p.get("method")
            if method not in METHODS:
                raise ValidationError("Forma de pago no válida.", "payments")
            amount = _int(p.get("amount_cents"), "amount_cents", 1)
            received = None
            if method == "cash":
                received = _int(p.get("received_cents", amount), "received_cents", 0)
                if received < amount:
                    raise ValidationError("El efectivo recibido es menor que lo que se cobra.", "received_cents")
            parsed.append((method, amount, received))
        if sum(a for _, a, _ in parsed) != total:
            raise ValidationError("Los pagos no cuadran con el total.", "payments")

        folio = (session.query(func.max(Sale.folio)).scalar() or 0) + 1
        sale = Sale(id=sale_id, folio=folio, user_id=user.id, client_id=client_id, subtotal_cents=subtotal,
                    discount_cents=discount, total_cents=total, status="paid",
                    note=str(payload.get("note") or "").strip()[:500])
        session.add(sale)
        session.flush()
        for v, qty, disc in lines:
            try:
                move(v.id, -qty, "sale", user.id, ref_type="sale", ref_id=sale_id)
            except InsufficientStock as e:
                raise _with_label(e, v) from None
            session.add(SaleItem(sale_id=sale_id, variant_id=v.id, qty=qty, unit_price_cents=v.price_cents,
                                 unit_cost_cents=v.cost_cents, discount_cents=disc))
        for method, amount, received in parsed:
            session.add(SalePayment(sale_id=sale_id, method=method, amount_cents=amount, received_cents=received))
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
    if sale.status == "cancelled":
        raise ConflictError("Esta venta ya estaba cancelada.")
    begin_write()
    sale = session.get(Sale, sale_id)
    if sale.status == "cancelled":
        raise ConflictError("Esta venta ya estaba cancelada.")
    try:
        for it in sale.items:
            move(it.variant_id, it.qty, "sale_cancel", user.id, reason, ref_type="sale", ref_id=sale.id)
        if sale.client_id:
            c = session.get(Client, sale.client_id)
            c.points = max(0, c.points - _points(sale.total_cents))
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


def sale_dict(s: Sale, with_cost: bool) -> dict:
    items = []
    for it in s.items:
        d = {"variant_id": it.variant_id, "sku": it.variant.sku, "name": it.variant.product.name,
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
            "client_name": client.name if client else None,
            "subtotal_cents": s.subtotal_cents, "discount_cents": s.discount_cents, "total_cents": s.total_cents,
            "change_cents": change, "note": s.note, "created_at": s.created_at.isoformat(),
            "cancel_reason": s.cancel_reason or None, "items": items, "payments": pays}
