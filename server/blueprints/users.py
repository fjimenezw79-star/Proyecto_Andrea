"""/api/users: usuarios del sistema (solo el administrador).

Alta de vendedores y administradores, cambio de nombre o rol, desactivar (sin borrar sus ventas) y restablecer la
contraseña de cualquiera sin saber la anterior. Nunca se queda el sistema sin un administrador activo.
"""
from __future__ import annotations

import re

from flask import Blueprint, request
from flask_login import current_user
from sqlalchemy import func
from werkzeug.security import generate_password_hash

from ..api_util import ValidationError, fail, ok
from ..db import begin_write, session
from ..models import LoginFailure, User
from ..security import admin_required
from .auth import DEFAULT_PASSWORDS, MIN_PASSWORD

bp = Blueprint("users", __name__, url_prefix="/api/users")

USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,39}$")
ROLES = ("admin", "seller")


def user_dict(u: User) -> dict:
    return {"id": u.id, "username": u.username, "name": u.full_name or u.username, "full_name": u.full_name,
            "role": u.role, "active": u.active, "created_at": u.created_at.isoformat() if u.created_at else None,
            "is_me": u.id == current_user.id}


def _password(value) -> str:
    pw = str(value or "")
    if len(pw) < MIN_PASSWORD:
        raise ValidationError(f"La contraseña debe tener al menos {MIN_PASSWORD} caracteres.", "password")
    if pw in DEFAULT_PASSWORDS:
        raise ValidationError("Elige una contraseña diferente a las iniciales (admin123 y 12345).", "password")
    return pw


def _name(value) -> str:
    name = str(value or "").strip()
    if not name:
        raise ValidationError("Escribe el nombre de la persona.", "full_name")
    return name[:120]


def _active_admins(exclude_id: int | None = None) -> int:
    q = session.query(func.count(User.id)).filter(User.role == "admin", User.active.is_(True))
    if exclude_id is not None:
        q = q.filter(User.id != exclude_id)
    return q.scalar() or 0


def _get(user_id: int) -> User:
    u = session.get(User, user_id)
    if not u:
        raise ValidationError("El usuario no existe.", "id")
    return u


@bp.get("")
@admin_required
def list_():
    users = session.query(User).order_by(User.active.desc(), User.role, User.username).all()
    return ok(users=[user_dict(u) for u in users])


@bp.post("")
@admin_required
def create():
    d = request.get_json(silent=True) or {}
    username = str(d.get("username") or "").strip().lower()
    if not USERNAME_RE.match(username):
        return fail("El usuario debe tener de 3 a 40 letras sin acentos, números, punto, guion o guion bajo, sin espacios.",
                    400, "username")
    role = d.get("role") or "seller"
    if role not in ROLES:
        return fail("Elige si es vendedor o administrador.", 400, "role")
    name, pw = _name(d.get("full_name")), _password(d.get("password"))
    begin_write()
    if session.query(User).filter(func.lower(User.username) == username).first():
        session.rollback()
        return fail(f"Ya existe el usuario «{username}». Elige otro.", 409, "username")
    u = User(username=username, full_name=name, role=role, active=True, password_hash=generate_password_hash(pw))
    session.add(u)
    session.commit()
    return ok(f"Usuario {username} creado.", 201, user=user_dict(u))


@bp.patch("/<int:user_id>")
@admin_required
def update(user_id: int):
    d = request.get_json(silent=True) or {}
    begin_write()
    u = _get(user_id)
    if "full_name" in d:
        u.full_name = _name(d["full_name"])
    if "role" in d:
        if d["role"] not in ROLES:
            raise ValidationError("Elige si es vendedor o administrador.", "role")
        if u.role == "admin" and d["role"] != "admin" and u.active and _active_admins(exclude_id=u.id) == 0:
            raise ValidationError("Debe quedar al menos un administrador activo.", "role")
        u.role = d["role"]
    if "active" in d:
        if not isinstance(d["active"], bool):
            raise ValidationError("Valor no válido.", "active")
        if not d["active"]:
            if u.id == current_user.id:
                raise ValidationError("No puedes desactivar tu propio usuario.", "active")
            if u.role == "admin" and _active_admins(exclude_id=u.id) == 0:
                raise ValidationError("Debe quedar al menos un administrador activo.", "active")
        u.active = d["active"]
    session.commit()
    msg = "Usuario desactivado: ya no puede entrar. Sus ventas se conservan." if d.get("active") is False else \
        "Usuario activado." if d.get("active") is True else "Usuario actualizado."
    return ok(msg, user=user_dict(u))


@bp.post("/<int:user_id>/password")
@admin_required
def reset_password(user_id: int):
    """Restablece la contraseña de cualquier usuario sin pedir la anterior (y lo desbloquea)."""
    d = request.get_json(silent=True) or {}
    pw = _password(d.get("password"))
    begin_write()
    u = _get(user_id)
    u.password_hash = generate_password_hash(pw)
    session.query(LoginFailure).filter_by(username=u.username).delete()
    session.commit()
    return ok(f"Contraseña de {u.username} restablecida. Ya puede entrar con la nueva.", user=user_dict(u))
