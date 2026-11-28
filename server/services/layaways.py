"""Apartados: el stock se aparta al crearlos; anticipo y abonos; liquidar crea la venta; cancelar regresa stock."""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timedelta

from flask import current_app
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from ..api_util import ConflictError, ValidationError
from ..db import begin_write, session
from ..models import Client, Layaway, LayawayItem, LayawayPayment, Sale, SaleItem, User
from . import payments as pay
from .inventory import InsufficientStock, move
from .sales import NotAllowed, label_insufficient, parse_items, points_for, price_lines

ID_RE = re.compile(r"^[A-Za-z0-9-]{8,40}$")


class NotFound(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _id(value, field="id") -> str:
    v = str(value or uuid.uuid4())
    if not ID_RE.match(v):
        raise ValidationError("Identificador no válido.", field)
    return v


def _deadline(value) -> date:
    if value in (None, ""):
        return date.today() + timedelta(days=current_app.config.get("LAYAWAY_DAYS", 30))
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise ValidationError("Fecha límite no válida (usa AAAA-MM-DD).", "deadline") from None


def get(layaway_id: str) -> Layaway:
    l = session.get(Layaway, layaway_id)
    if not l:
        raise NotFound("El apartado no existe.")
    return l


def _add_payments(l: Layaway, parsed, payment_id: str, user) -> None:
    cash_id = pay.apply(parsed, client_id=l.client_id, user_id=user.id)
    for i, p in enumerate(parsed):
        session.add(LayawayPayment(id=payment_id if i == 0 else f"{payment_id[:36]}-{i}", layaway_id=l.id,
                                   method=p.method, amount_cents=p.amount_cents, received_cents=p.received_cents,
                                   user_id=user.id, cash_session_id=cash_id if p.method == "cash" else None))
    l.paid_cents += sum(p.amount_cents for p in parsed)


def create(payload: dict, user) -> Layaway:
    lid = _id(payload.get("id"))
    if session.get(Layaway, lid):
        return session.get(Layaway, lid)
    client_id = payload.get("client_id")
    if not client_id or not session.get(Client, str(client_id)):
        raise ValidationError("Elige al cliente del apartado.", "client_id")
    raw_items = parse_items(payload.get("items") or [])
    deadline = _deadline(payload.get("deadline"))
    begin_write()
    try:
        if session.get(Layaway, lid):
            return session.get(Layaway, lid)
        lines, subtotal, discount, total = price_lines(raw_items, payload.get("discount_cents", 0), user)
        if not payload.get("payments"):
            raise ValidationError("El apartado necesita un anticipo.", "payments")
        parsed = pay.parse(payload.get("payments"), total, client_id, exact=False)
        deposit = sum(p.amount_cents for p in parsed)
        if deposit <= 0:
            raise ValidationError("El apartado necesita un anticipo.", "payments")
        if deposit > total:
            raise ValidationError("El anticipo es mayor que el total.", "payments")
        folio = (session.query(func.max(Layaway.folio)).scalar() or 0) + 1
        l = Layaway(id=lid, folio=folio, client_id=client_id, user_id=user.id, subtotal_cents=subtotal,
                    discount_cents=discount, total_cents=total, paid_cents=0, deadline=deadline,
                    note=str(payload.get("note") or "").strip()[:500])
        session.add(l)
        session.flush()
        for v, qty, disc in lines:
            try:
                move(v.id, -qty, "layaway", user.id, ref_type="layaway", ref_id=lid)
            except InsufficientStock as e:
                raise label_insufficient(e, v) from None
            session.add(LayawayItem(layaway_id=lid, variant_id=v.id, qty=qty, unit_price_cents=v.price_cents,
                                    unit_cost_cents=v.cost_cents, discount_cents=disc))
        _add_payments(l, parsed, f"{lid}-a", user)
        session.commit()
        return l
    except Exception:
        session.rollback()
        raise


def add_payment(layaway_id: str, payload: dict, user) -> Layaway:
    payment_id = _id(payload.get("id"))
    begin_write()
    try:
        l = get(layaway_id)
        prev = session.get(LayawayPayment, payment_id)
        if prev:
            if prev.layaway_id != l.id:
                raise ConflictError("Ese identificador de abono ya se usó en otro apartado.")
            return l
        if l.status != "pending":
            raise ConflictError("Este apartado ya no admite abonos.")
        balance = l.total_cents - l.paid_cents
        parsed = pay.parse(payload.get("payments"), balance, l.client_id, exact=False)
        amount = sum(p.amount_cents for p in parsed)
        if amount <= 0:
            raise ValidationError("Escribe el monto del abono.", "payments")
        if amount > balance:
            raise ValidationError(f"El abono es mayor que el saldo. Faltan {pay.money(balance)}.", "payments")
        _add_payments(l, parsed, payment_id, user)
        session.commit()
        return l
    except Exception:
        session.rollback()
        raise


def settle(layaway_id: str, payload: dict, user) -> tuple[Layaway, Sale]:
    begin_write()
    try:
        l = get(layaway_id)
        if l.status == "settled" and l.settled_sale_id:
            pid = payload.get("payment_id")
            prev = session.get(LayawayPayment, str(pid)) if pid else None
            if not payload.get("payments") or (prev and prev.layaway_id == l.id):
                session.rollback()
                return l, session.get(Sale, l.settled_sale_id)  # reintento de algo que ya se hizo
        if l.status != "pending":
            raise ConflictError("Este apartado ya estaba liquidado o cancelado.")
        balance = l.total_cents - l.paid_cents
        if payload.get("payments"):
            parsed = pay.parse(payload.get("payments"), balance, l.client_id, exact=False)
            if sum(p.amount_cents for p in parsed) > balance:
                raise ValidationError(f"El pago es mayor que el saldo. Faltan {pay.money(balance)}.", "payments")
            _add_payments(l, parsed, _id(payload.get("payment_id")), user)
        if l.paid_cents != l.total_cents:
            raise ValidationError(f"Faltan {pay.money(l.total_cents - l.paid_cents)} para liquidar.", "payments")
        from .sales import _next_folio  # evita import circular al cargar
        sale = Sale(id=str(uuid.uuid4()), folio=_next_folio(), user_id=user.id, client_id=l.client_id,
                    subtotal_cents=l.subtotal_cents, discount_cents=l.discount_cents, total_cents=l.total_cents,
                    status="paid", source="layaway", layaway_id=l.id, note=f"Apartado #{l.folio}")
        session.add(sale)
        session.flush()
        for it in l.items:
            session.add(SaleItem(sale_id=sale.id, variant_id=it.variant_id, qty=it.qty,
                                 unit_price_cents=it.unit_price_cents, unit_cost_cents=it.unit_cost_cents,
                                 discount_cents=it.discount_cents))
        session.get(Client, l.client_id).points += points_for(l.total_cents)
        l.status = "settled"
        l.settled_sale_id = sale.id
        l.settled_at = datetime.now().replace(microsecond=0)
        session.commit()
        return l, sale
    except Exception:
        session.rollback()
        raise


def cancel(layaway_id: str, payload: dict, user) -> Layaway:
    if user.role != "admin":
        raise NotAllowed("Solo el administrador puede cancelar apartados.")
    reason = str(payload.get("reason") or "").strip()
    if not reason:
        raise ValidationError("Escribe el motivo de la cancelación.", "reason")
    mode = payload.get("refund_mode")
    if mode not in ("refund", "credit"):
        raise ValidationError("Elige si se devuelve el dinero o queda como saldo a favor.", "refund_mode")
    method = payload.get("refund_method") if mode == "refund" else None
    if mode == "refund" and method not in ("cash", "card", "transfer"):
        raise ValidationError("Elige cómo se devuelve el dinero.", "refund_method")
    begin_write()
    try:
        l = get(layaway_id)
        if l.status != "pending":
            raise ConflictError("Este apartado ya estaba liquidado o cancelado.")
        for it in l.items:
            move(it.variant_id, it.qty, "layaway_cancel", user.id, reason, ref_type="layaway", ref_id=l.id)
        if mode == "credit":
            session.get(Client, l.client_id).credit_cents += l.paid_cents
        elif method == "cash" and l.paid_cents:
            l.refund_cash_session_id = pay.cash_session_for_out("cash", user.id)
        l.status = "cancelled"
        l.refund_mode, l.refund_method = mode, method
        l.cancel_reason = reason[:500]
        l.cancelled_at = datetime.now().replace(microsecond=0)
        l.cancelled_by = user.id
        session.commit()
        return l
    except Exception:
        session.rollback()
        raise


def list_(status: str | None) -> list[Layaway]:
    q = session.query(Layaway)
    if status == "overdue":
        q = q.filter(Layaway.status == "pending", Layaway.deadline < date.today())
    elif status in ("pending", "settled", "cancelled"):
        q = q.filter(Layaway.status == status)
    order = Layaway.deadline.asc() if status in (None, "pending", "overdue") else Layaway.created_at.desc()
    return q.order_by(order).limit(300).all()


def user_names() -> dict[int, str]:
    return {u.id: (u.full_name or u.username) for u in session.query(User).all()}


def layaway_dict(l: Layaway, sellers: dict[int, str] | None = None) -> dict:
    sellers = sellers if sellers is not None else user_names()
    items = [{"variant_id": it.variant_id, "sku": it.variant.sku, "name": it.variant.product.name,
              "attrs": it.variant.attrs or {}, "qty": it.qty, "unit_price_cents": it.unit_price_cents,
              "discount_cents": it.discount_cents,
              "photo": (f"/uploads/{it.variant.product.photos[0].thumb_filename}" if it.variant.product.photos else None)}
             for it in l.items]
    return {"id": l.id, "folio": l.folio, "status": l.status, "client_id": l.client_id, "client_name": l.client.name,
            "client_phone": l.client.phone, "user_name": sellers.get(l.user_id), "subtotal_cents": l.subtotal_cents,
            "discount_cents": l.discount_cents, "total_cents": l.total_cents, "paid_cents": l.paid_cents,
            "balance_cents": l.total_cents - l.paid_cents, "deadline": l.deadline.isoformat(),
            "days_left": (l.deadline - date.today()).days, "overdue": l.status == "pending" and l.deadline < date.today(),
            "created_at": l.created_at.isoformat(), "settled_sale_id": l.settled_sale_id,
            "cancel_reason": l.cancel_reason or None, "refund_mode": l.refund_mode, "refund_method": l.refund_method,
            "items": items,
            "payments": [{"id": p.id, "method": p.method, "amount_cents": p.amount_cents, "received_cents": p.received_cents,
                          "user_name": sellers.get(p.user_id), "created_at": p.created_at.isoformat()} for p in l.payments]}
