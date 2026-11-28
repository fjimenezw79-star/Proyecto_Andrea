"""Formas de pago compartidas por ventas, abonos y reembolsos: efectivo, tarjeta, transferencia y saldo a favor."""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import update

from ..api_util import ValidationError, strict_int
from ..db import session
from ..models import Client
from . import cash

METHODS = {"cash", "card", "transfer", "credit"}


def money(cents: int) -> str:
    return f"${cents / 100:,.2f}"


@dataclass
class ParsedPayment:
    method: str
    amount_cents: int
    received_cents: int | None


def parse(raw, total: int, client_id: str | None, *, exact: bool = True) -> list[ParsedPayment]:
    """Valida los pagos. ``exact`` exige que sumen ``total``; si no, que no lo rebasen (abonos)."""
    if raw in (None, ""):
        raw = []
    if not isinstance(raw, list) or not all(isinstance(p, dict) for p in raw):
        raise ValidationError("Formas de pago no válidas.", "payments")
    if not raw and total > 0:
        raise ValidationError("Agrega la forma de pago.", "payments")
    out = []
    for p in raw:
        method = p.get("method")
        if method not in METHODS:
            raise ValidationError("Forma de pago no válida.", "payments")
        amount = strict_int(p.get("amount_cents"), "amount_cents", 1)
        received = None
        if method == "cash":
            received = strict_int(p.get("received_cents", amount), "received_cents", 0)
            if received < amount:
                raise ValidationError("El efectivo recibido es menor que lo que se cobra.", "received_cents")
        out.append(ParsedPayment(method, amount, received))
    paid = sum(p.amount_cents for p in out)
    if exact and paid != total:
        raise ValidationError("Los pagos no cuadran con el total.", "payments")
    credit = sum(p.amount_cents for p in out if p.method == "credit")
    if credit:
        if not client_id:
            raise ValidationError("Elige al cliente para usar su saldo a favor.", "payments")
        c = session.get(Client, client_id)
        if c is None or c.credit_cents < credit:
            raise ValidationError(f"El saldo a favor del cliente es de {money(c.credit_cents if c else 0)}.", "payments")
    return out


def apply(parsed: list[ParsedPayment], *, client_id: str | None, user_id: int) -> int | None:
    """Descuenta el saldo a favor usado y devuelve la caja del efectivo (si lo hay). No hace commit."""
    credit = sum(p.amount_cents for p in parsed if p.method == "credit")
    if credit:
        res = session.execute(update(Client).where(Client.id == client_id, Client.credit_cents >= credit)
                              .values(credit_cents=Client.credit_cents - credit)
                              .execution_options(synchronize_session="fetch"))
        if res.rowcount != 1:
            c = session.get(Client, client_id)
            raise ValidationError(f"El saldo a favor del cliente es de {money(c.credit_cents if c else 0)}.", "payments")
    if any(p.method == "cash" for p in parsed):
        return cash.current_or_auto(user_id)
    cs = cash.current()  # tarjeta/transferencia/saldo: cuentan en la caja abierta que los recibió (si hay)
    return cs.id if cs else None


def cash_session_for_out(method: str, user_id: int) -> int | None:
    """Para reembolsos y gastos: si el dinero sale en efectivo, de qué caja sale."""
    return cash.current_or_auto(user_id) if method == "cash" else None
