"""Pedidos de la tienda en línea.

Flujo: llega **pendiente** (no aparta piezas) → el personal lo **confirma** con el costo de envío y aparta las
piezas → lo **cobra** (se convierte en venta sin volver a descontar) o lo **rechaza** (regresan las piezas).
Un mismo pedido enviado dos veces (reintento de la tienda) se registra una sola vez: el id lo genera la tienda.
"""
from __future__ import annotations

import re
import secrets
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from ..api_util import ValidationError, strict_int
from ..db import begin_write, session
from ..models import Client, OnlineOrder, Product, Sale, SaleItem, SalePayment, Variant
from . import payments as pay
from .inventory import InsufficientStock, move

ID_RE = re.compile(r"^[A-Za-z0-9-]{8,36}$")
FOLIO_RE = re.compile(r"^W-[A-Z0-9]{4,8}$")
STATUSES = ("pending", "confirmed", "paid", "rejected")
MAX_LINES = 30
MAX_QTY = 50


class NotFound(Exception):
    message = "El pedido no existe."


class WrongStatus(ValidationError):
    pass


def _text(value, field: str, max_len: int, required: bool = False) -> str:
    v = str(value or "").strip()
    if required and not v:
        raise ValidationError("Falta un dato obligatorio.", field)
    return v[:max_len]


def _phone(value) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    if not 10 <= len(digits) <= 13:
        raise ValidationError("Escribe un WhatsApp de 10 dígitos.", "phone")
    return digits[-10:] if len(digits) > 10 and digits.startswith("52") else digits


def new_folio() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin 0/O ni 1/I para dictarlo por teléfono
    return "W-" + "".join(secrets.choice(alphabet) for _ in range(5))


def _sellable(variant_ids: list[int]) -> dict[int, Variant]:
    rows = session.scalars(select(Variant).join(Product).where(
        Variant.id.in_(variant_ids), Variant.active.is_(True), Product.active.is_(True), Product.online.is_(True)))
    return {v.id: v for v in rows}


def intake(data: dict, source: str = "local") -> tuple[OnlineOrder, bool]:
    """Registra un pedido de la tienda. Devuelve (pedido, nuevo)."""
    if not isinstance(data, dict):
        raise ValidationError("Pedido no válido.", "order")
    oid = str(data.get("id") or "")
    if not ID_RE.match(oid):
        raise ValidationError("Pedido no válido.", "id")
    found = session.get(OnlineOrder, oid)
    if found:
        return found, False
    name = _text(data.get("name"), "name", 120, required=True)
    phone = _phone(data.get("phone"))
    delivery = "shipping" if data.get("delivery") == "shipping" else "pickup"
    address = _text(data.get("address"), "address", 300)
    if delivery == "shipping" and not address:
        raise ValidationError("Escribe la dirección de envío.", "address")
    raw = data.get("items")
    if not isinstance(raw, list) or not 1 <= len(raw) <= MAX_LINES:
        raise ValidationError("El pedido no tiene productos.", "items")
    wanted: dict[int, int] = {}
    for it in raw:
        if not isinstance(it, dict):
            raise ValidationError("Pedido no válido.", "items")
        vid = strict_int(it.get("variant_id"), "variant_id", 1)
        qty = strict_int(it.get("qty"), "qty", 1)
        wanted[vid] = min(MAX_QTY, wanted.get(vid, 0) + qty)
    variants = _sellable(list(wanted))
    if len(variants) != len(wanted):
        raise ValidationError("Uno de los productos ya no está en la tienda. Actualiza la página.", "items")
    items = []
    for vid, qty in wanted.items():
        v = variants[vid]
        label = " / ".join(str(x) for x in (v.attrs or {}).values() if x)
        items.append({"variant_id": vid, "sku": v.sku, "name": v.product.name, "variant": label, "qty": qty,
                      "unit_price_cents": v.price_cents, "available": v.stock >= qty})
    folio = str(data.get("folio") or "")
    begin_write()
    try:
        if session.get(OnlineOrder, oid):
            session.rollback()
            return session.get(OnlineOrder, oid), False
        if not FOLIO_RE.match(folio) or session.scalar(select(OnlineOrder.id).where(OnlineOrder.folio == folio)):
            folio = new_folio()
        o = OnlineOrder(id=oid, folio=folio, source=source, customer_name=name, phone=phone, delivery=delivery,
                        address=address, note=_text(data.get("note"), "note", 500), items=items,
                        subtotal_cents=sum(i["qty"] * i["unit_price_cents"] for i in items), shipping_cents=0,
                        status="pending", reason="")
        session.add(o)
        session.commit()
        return o, True
    except IntegrityError:
        session.rollback()
        found = session.get(OnlineOrder, oid)
        if found:
            return found, False
        raise


def get(order_id: str) -> OnlineOrder:
    o = session.get(OnlineOrder, order_id)
    if not o:
        raise NotFound()
    return o


def _require(o: OnlineOrder, *allowed: str) -> None:
    if o.status not in allowed:
        names = {"pending": "pendiente", "confirmed": "confirmado", "paid": "cobrado", "rejected": "rechazado"}
        raise WrongStatus(f"El pedido {o.folio} ya está {names[o.status]}.", "status")


def _client_for(o: OnlineOrder) -> str:
    c = session.scalars(select(Client).where(Client.phone == o.phone, Client.active.is_(True)).limit(1)).first()
    if c:
        return c.id
    c = Client(id=str(uuid.uuid4()), name=o.customer_name, phone=o.phone, notes="Cliente de la tienda en línea.")
    session.add(c)
    session.flush()
    return c.id


def confirm(order_id: str, shipping_cents, user) -> OnlineOrder:
    """Aparta las piezas y fija el costo de envío. Sin piezas suficientes no confirma nada (409)."""
    shipping = strict_int(shipping_cents or 0, "shipping_cents", 0)
    begin_write()
    try:
        o = get(order_id)
        _require(o, "pending")
        if o.delivery == "pickup" and shipping:
            raise ValidationError("Un pedido que se recoge en tienda no lleva envío.", "shipping_cents")
        for it in o.items:
            try:
                move(it["variant_id"], -it["qty"], "online", user.id, ref_type="online", ref_id=o.id, note=f"Pedido {o.folio}")
            except InsufficientStock as e:
                e.message = f"No hay piezas suficientes de {it['name']} {it['variant']}".rstrip() + f". Quedan {e.available}."
                raise
        o.client_id = o.client_id or _client_for(o)
        o.shipping_cents, o.status, o.handled_by = shipping, "confirmed", user.id
        session.commit()
        return o
    except Exception:
        session.rollback()
        raise


def charge(order_id: str, payload: dict, user) -> tuple[OnlineOrder, Sale]:
    """Convierte el pedido confirmado en venta. Las piezas ya estaban apartadas: no se descuentan otra vez."""
    from .sales import _next_folio, points_for

    begin_write()
    try:
        o = get(order_id)
        _require(o, "confirmed")
        total = o.subtotal_cents + o.shipping_cents
        parsed = pay.parse(payload.get("payments"), total, o.client_id)
        cash_session_id = pay.apply(parsed, client_id=o.client_id, user_id=user.id)
        sale = Sale(id=str(uuid.uuid4()), folio=_next_folio(), user_id=user.id, client_id=o.client_id,
                    subtotal_cents=o.subtotal_cents, discount_cents=0, total_cents=total, shipping_cents=o.shipping_cents,
                    status="paid", source="online", note=f"Pedido en línea {o.folio}")
        session.add(sale)
        session.flush()
        for it in o.items:
            v = session.get(Variant, it["variant_id"])
            session.add(SaleItem(sale_id=sale.id, variant_id=it["variant_id"], qty=it["qty"],
                                 unit_price_cents=it["unit_price_cents"], unit_cost_cents=v.cost_cents if v else 0,
                                 discount_cents=0))
        for p in parsed:
            session.add(SalePayment(sale_id=sale.id, method=p.method, amount_cents=p.amount_cents,
                                    received_cents=p.received_cents, cash_session_id=cash_session_id))
        if o.client_id:
            session.get(Client, o.client_id).points += points_for(o.subtotal_cents)
        o.status, o.sale_id, o.handled_by = "paid", sale.id, user.id
        session.commit()
        return o, sale
    except Exception:
        session.rollback()
        raise


def reject(order_id: str, reason: str, user) -> OnlineOrder:
    reason = str(reason or "").strip()
    if not reason:
        raise ValidationError("Escribe el motivo.", "reason")
    begin_write()
    try:
        o = get(order_id)
        _require(o, "pending", "confirmed")
        if o.status == "confirmed":
            for it in o.items:
                move(it["variant_id"], it["qty"], "online_cancel", user.id, ref_type="online", ref_id=o.id,
                     note=f"Pedido {o.folio} rechazado")
        o.status, o.reason, o.handled_by = "rejected", reason[:500], user.id
        session.commit()
        return o
    except Exception:
        session.rollback()
        raise


def list_(status: str | None) -> list[OnlineOrder]:
    q = select(OnlineOrder).order_by(OnlineOrder.created_at.desc()).limit(300)
    if status in STATUSES:
        q = q.where(OnlineOrder.status == status)
    return list(session.scalars(q))


def counts() -> dict[str, int]:
    rows = session.execute(select(OnlineOrder.status, func.count()).group_by(OnlineOrder.status)).all()
    return {s: 0 for s in STATUSES} | {s: n for s, n in rows}


def order_dict(o: OnlineOrder) -> dict:
    return {"id": o.id, "folio": o.folio, "created_at": o.created_at.isoformat(), "source": o.source,
            "customer_name": o.customer_name, "phone": o.phone, "delivery": o.delivery, "address": o.address,
            "note": o.note, "items": o.items, "subtotal_cents": o.subtotal_cents, "shipping_cents": o.shipping_cents,
            "total_cents": o.subtotal_cents + o.shipping_cents, "status": o.status, "client_id": o.client_id,
            "sale_id": o.sale_id, "reason": o.reason or None,
            "updated_at": o.updated_at.isoformat() if isinstance(o.updated_at, datetime) else None}
