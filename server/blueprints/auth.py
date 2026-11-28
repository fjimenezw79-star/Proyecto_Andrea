"""/api/auth: iniciar y cerrar sesión."""
from __future__ import annotations

from flask import Blueprint, current_app, request
from flask_login import current_user, login_required, login_user, logout_user
from flask_wtf.csrf import generate_csrf
from werkzeug.security import check_password_hash, generate_password_hash

from ..api_util import fail, ok
from ..db import begin_write, session
from ..models import User
from ..tunnel_middleware import via_internet
from ..security import SessionUser, clear_failures, purge_old_failures, record_failure, seconds_locked

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

DEFAULT_PASSWORDS = {"admin123", "12345"}
MIN_PASSWORD = 6


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip().lower()
    password = str(data.get("password", ""))
    begin_write()  # la revisión de intentos y su registro van juntos
    purge_old_failures()
    wait = seconds_locked(username)
    if wait:
        minutes = max(1, round(wait / 60))
        return fail(f"Demasiados intentos. Intenta de nuevo en {minutes} min.", 429)
    u = session.query(User).filter_by(username=username).one_or_none()
    if not u or not u.active or not check_password_hash(u.password_hash, password):
        record_failure(username)
        return fail("Usuario o contraseña incorrectos.", 401)
    clear_failures(username)
    if password in DEFAULT_PASSWORDS and via_internet() and current_app.config["BLOCK_DEFAULT_PASSWORDS_REMOTE"]:
        session.commit()
        return fail("Cambia la contraseña inicial desde la computadora del negocio antes de entrar por internet.", 403)
    su = SessionUser(u)
    login_user(su, remember=bool(data.get("remember")))
    return ok(user=su.to_dict())


@bp.post("/logout")
@login_required
def logout():
    logout_user()
    return ok("Sesión cerrada.")


@bp.get("/me")
@login_required
def me():
    return ok(user=current_user.to_dict())


@bp.get("/csrf")
def csrf_token():
    return ok(token=generate_csrf())


@bp.post("/password")
@login_required
def change_password():
    """Cambiar la contraseña propia (pide la actual)."""
    data = request.get_json(silent=True) or {}
    current, new = str(data.get("current", "")), str(data.get("new", ""))
    begin_write()
    u = session.get(User, current_user.id)
    if not check_password_hash(u.password_hash, current):
        session.rollback()
        return fail("La contraseña actual no es correcta.", 400, field="current")
    if len(new) < MIN_PASSWORD:
        session.rollback()
        return fail(f"La nueva contraseña debe tener al menos {MIN_PASSWORD} caracteres.", 400, field="new")
    if new in DEFAULT_PASSWORDS or new == current:
        session.rollback()
        return fail("Elige una contraseña diferente a la inicial.", 400, field="new")
    u.password_hash = generate_password_hash(new)
    session.commit()
    return ok("Contraseña actualizada.")
