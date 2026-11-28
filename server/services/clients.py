"""Clientes: datos de contacto, puntos de lealtad y saldo a favor."""
from __future__ import annotations

import re
import uuid

from sqlalchemy import func, or_

from ..api_util import ConflictError, ValidationError
from ..db import begin_write, session
from ..models import Client, Layaway, Sale

ID_RE = re.compile(r"^[A-Za-z0-9-]{8,36}$")


class NotFound(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def _phone(value) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    if digits and len(digits) != 10:
        raise ValidationError("El teléfono debe tener 10 dígitos.", "phone")
    return digits


def _check_phone_free(phone: str, client_id: str | None = None) -> None:
    if not phone:
        return
    q = session.query(Client).filter(Client.phone == phone, Client.active.is_(True))
    if client_id:
        q = q.filter(Client.id != client_id)
    other = q.first()
    if other:
        raise ConflictError(f"Ya existe un cliente con ese teléfono: {other.name}.", client_id=other.id)


def _name(value) -> str:
    name = str(value or "").strip()
    if not name:
        raise ValidationError("Escribe el nombre del cliente.", "name")
    return name[:120]


def create(data: dict) -> tuple[Client, bool]:
    """Devuelve (cliente, creado). Si el id del dispositivo ya existe, devuelve ese cliente."""
    cid = str(data.get("id") or uuid.uuid4())
    if not ID_RE.match(cid):
        raise ValidationError("Identificador de cliente no válido.", "id")
    existing = session.get(Client, cid)
    if existing:
        return existing, False
    name, phone = _name(data.get("name")), _phone(data.get("phone"))
    email = str(data.get("email") or "").strip()[:120]
    begin_write()
    _check_phone_free(phone)
    c = Client(id=cid, name=name, phone=phone, email=email, notes=str(data.get("notes") or "").strip()[:1000])
    session.add(c)
    session.commit()
    return c, True


def update(client_id: str, data: dict) -> Client:
    c = get(client_id)
    begin_write()
    c = session.get(Client, client_id)
    if "name" in data:
        c.name = _name(data["name"])
    if "phone" in data:
        phone = _phone(data["phone"])
        _check_phone_free(phone, c.id)
        c.phone = phone
    if "email" in data:
        c.email = str(data["email"] or "").strip()[:120]
    if "notes" in data:
        c.notes = str(data["notes"] or "").strip()[:1000]
    if "active" in data:
        c.active = bool(data["active"])
    session.commit()
    return c


def get(client_id: str) -> Client:
    c = session.get(Client, client_id)
    if not c:
        raise NotFound("El cliente no existe.")
    return c


def search(q: str, limit: int = 20) -> list[Client]:
    query = session.query(Client).filter(Client.active.is_(True))
    q = (q or "").strip()
    if q:
        digits = re.sub(r"\D", "", q)
        conds = [Client.name.ilike(f"%{q}%")]
        if digits:
            conds.append(Client.phone.like(f"%{digits}%"))
        query = query.filter(or_(*conds))
    return query.order_by(Client.name).limit(limit).all()


def client_dict(c: Client) -> dict:
    return {"id": c.id, "name": c.name, "phone": c.phone, "email": c.email, "points": c.points,
            "credit_cents": c.credit_cents, "notes": c.notes, "active": c.active,
            "created_at": c.created_at.isoformat()}


def detail(client_id: str) -> dict:
    c = get(client_id)
    sales = (session.query(Sale).filter(Sale.client_id == c.id).order_by(Sale.created_at.desc()).limit(50).all())
    spent = session.query(func.coalesce(func.sum(Sale.total_cents), 0)).filter(
        Sale.client_id == c.id, Sale.status == "paid").scalar()
    layaways = session.query(Layaway).filter(Layaway.client_id == c.id).order_by(Layaway.created_at.desc()).all()
    return {
        "client": client_dict(c),
        "total_spent_cents": int(spent),
        "sales": [{"id": s.id, "folio": s.folio, "total_cents": s.total_cents, "status": s.status,
                   "created_at": s.created_at.isoformat()} for s in sales],
        "layaways": [{"id": l.id, "folio": l.folio, "total_cents": l.total_cents, "paid_cents": l.paid_cents,
                      "status": l.status, "deadline": l.deadline.isoformat()} for l in layaways],
    }
