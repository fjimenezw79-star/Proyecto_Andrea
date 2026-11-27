"""/api/clients: alta, búsqueda, edición y ficha de clientes."""
from __future__ import annotations

from flask import Blueprint, request
from flask_login import login_required

from ..api_util import fail, ok
from ..services import clients

bp = Blueprint("clients", __name__, url_prefix="/api/clients")


@bp.errorhandler(LookupError)
def _missing(e):
    return fail(str(e), 404)


@bp.get("")
@login_required
def search():
    return ok(clients=[clients.client_dict(c) for c in clients.search(request.args.get("q", ""))])


@bp.post("")
@login_required
def create():
    c, created = clients.create(request.get_json(silent=True) or {})
    return ok("Cliente registrado." if created else "", 201 if created else 200, client=clients.client_dict(c))


@bp.patch("/<client_id>")
@login_required
def update(client_id: str):
    return ok("Cliente actualizado.", client=clients.client_dict(clients.update(client_id, request.get_json(silent=True) or {})))


@bp.get("/<client_id>")
@login_required
def detail(client_id: str):
    return ok(**clients.detail(client_id))
