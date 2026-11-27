"""/api/cash: abrir caja, ver el turno y hacer el corte."""
from __future__ import annotations

from flask import Blueprint, request
from flask_login import current_user, login_required

from ..api_util import ok
from ..security import admin_required
from ..services import cash

bp = Blueprint("cash", __name__, url_prefix="/api/cash")


@bp.get("/current")
@login_required
def current():
    cs = cash.current()
    return ok(session=cash.session_dict(cs), summary=cash.summary(cs) if cs else None)


@bp.post("/open")
@login_required
def open_():
    cs = cash.open_((request.get_json(silent=True) or {}).get("opening_cents", 0), current_user.id)
    return ok("Caja abierta.", 201, session=cash.session_dict(cs), summary=cash.summary(cs))


@bp.post("/close")
@login_required
def close():
    d = request.get_json(silent=True) or {}
    cs = cash.close(d.get("counted_cents"), d.get("notes", ""), current_user.id)
    return ok("Corte registrado.", session=cash.session_dict(cs), summary=cash.summary(cs))


@bp.get("/sessions")
@admin_required
def sessions():
    return ok(sessions=[cash.session_dict(cs) for cs in cash.history()])
