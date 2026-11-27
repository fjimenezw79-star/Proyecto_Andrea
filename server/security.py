"""Sesión, roles y bloqueo por intentos fallidos (adaptado de AcuaGest DEMO 3.0)."""
from __future__ import annotations

from datetime import datetime, timedelta
from functools import wraps

from flask_login import LoginManager, UserMixin, current_user
from werkzeug.security import generate_password_hash

from .api_util import fail
from .db import session
from .models import LoginFailure, User

MAX_ATTEMPTS = 5
WINDOW = timedelta(minutes=15)
LOCK = timedelta(minutes=5)
DEFAULT_USERS = (("admin", "admin123", "admin", "Administrador"), ("vendedor", "12345", "seller", "Vendedor"))

login_manager = LoginManager()


class SessionUser(UserMixin):
    def __init__(self, u: User):
        self.id = u.id
        self.username = u.username
        self.full_name = u.full_name
        self.role = u.role
        self._active = u.active

    @property
    def is_active(self) -> bool:
        return self._active

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    def to_dict(self) -> dict:
        return {"id": self.id, "username": self.username, "full_name": self.full_name, "role": self.role}


@login_manager.user_loader
def _load_user(user_id: str):
    u = session.get(User, int(user_id))
    return SessionUser(u) if u and u.active else None


@login_manager.unauthorized_handler
def _unauthorized():
    return fail("Inicia sesión para continuar.", 401)


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated:
            return fail("Inicia sesión para continuar.", 401)
        if not current_user.is_admin:
            return fail("Solo el administrador puede hacer esto.", 403)
        return view(*args, **kwargs)

    return wrapped


def seconds_locked(username: str) -> int:
    """Segundos que faltan de bloqueo: 5 fallos en 15 minutos bloquean 5 minutos desde el último."""
    since = datetime.now() - WINDOW
    fails = (session.query(LoginFailure).filter(LoginFailure.username == username.lower(), LoginFailure.at >= since)
             .order_by(LoginFailure.at.desc()).all())
    if len(fails) < MAX_ATTEMPTS:
        return 0
    remaining = (fails[0].at + LOCK - datetime.now()).total_seconds()
    return max(0, int(remaining) + 1)


def record_failure(username: str) -> None:
    session.add(LoginFailure(username=username.lower()))
    session.commit()


def clear_failures(username: str) -> None:
    session.query(LoginFailure).filter_by(username=username.lower()).delete()
    session.commit()


def ensure_default_users() -> None:
    if session.query(User).count():
        return
    for username, pw, role, name in DEFAULT_USERS:
        session.add(User(username=username, password_hash=generate_password_hash(pw), role=role, full_name=name))
    session.commit()


def init_app(app) -> None:
    login_manager.init_app(app)
    with app.app_context():
        ensure_default_users()
