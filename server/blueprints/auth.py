"""/api/auth: iniciar y cerrar sesión."""
from __future__ import annotations

from flask import Blueprint, request
from flask_login import current_user, login_required, login_user, logout_user
from flask_wtf.csrf import generate_csrf
from werkzeug.security import check_password_hash

from ..api_util import fail, ok
from ..db import begin_write, session
from ..models import User
from ..security import SessionUser, clear_failures, record_failure, seconds_locked

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip().lower()
    password = str(data.get("password", ""))
    begin_write()  # la revisión de intentos y su registro van juntos
    wait = seconds_locked(username)
    if wait:
        minutes = max(1, round(wait / 60))
        return fail(f"Demasiados intentos. Intenta de nuevo en {minutes} min.", 429)
    u = session.query(User).filter_by(username=username).one_or_none()
    if not u or not u.active or not check_password_hash(u.password_hash, password):
        record_failure(username)
        return fail("Usuario o contraseña incorrectos.", 401)
    clear_failures(username)
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
