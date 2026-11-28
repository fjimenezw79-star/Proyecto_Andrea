"""/api/online-orders: pedidos de la tienda en línea (administrador) y /api/store: estado de la tienda."""
from __future__ import annotations

from flask import Blueprint, request
from flask_login import current_user

from ..api_util import fail, ok
from ..security import admin_required
from ..services import online_orders as svc
from ..services.sales import sale_dict

bp = Blueprint("online_orders", __name__, url_prefix="/api/online-orders")


@bp.errorhandler(svc.NotFound)
def _missing(e):
    return fail(e.message, 404)


@bp.get("")
@admin_required
def list_():
    return ok(orders=[svc.order_dict(o) for o in svc.list_(request.args.get("status"))], counts=svc.counts())


@bp.get("/counts")
@admin_required
def counts():
    return ok(counts=svc.counts())


@bp.get("/<order_id>")
@admin_required
def get(order_id: str):
    return ok(order=svc.order_dict(svc.get(order_id)))


@bp.post("/<order_id>/confirm")
@admin_required
def confirm(order_id: str):
    d = request.get_json(silent=True) or {}
    o = svc.confirm(order_id, d.get("shipping_cents", 0), current_user)
    return ok(f"Pedido {o.folio} confirmado. Las piezas quedaron apartadas.", order=svc.order_dict(o))


@bp.post("/<order_id>/charge")
@admin_required
def charge(order_id: str):
    o, sale = svc.charge(order_id, request.get_json(silent=True) or {}, current_user)
    return ok(f"Pedido {o.folio} cobrado como venta #{sale.folio}.", order=svc.order_dict(o),
              sale=sale_dict(sale, True))


@bp.post("/<order_id>/reject")
@admin_required
def reject(order_id: str):
    d = request.get_json(silent=True) or {}
    o = svc.reject(order_id, d.get("reason", ""), current_user)
    return ok(f"Pedido {o.folio} rechazado.", order=svc.order_dict(o))


store_bp = Blueprint("store_admin", __name__, url_prefix="/api/store")


@store_bp.get("")
@admin_required
def store_status():
    from ..store import cloud
    from .connect import connection

    local = connection()["url"].rstrip("/") + "/tienda/"
    return ok(local_url=local, public_url=cloud.public_url() or local, cloud=cloud.status())


@store_bp.post("/publish")
@admin_required
def publish():
    from ..store import cloud

    if not cloud.configured():
        return fail("La publicación en Cloudflare no está configurada. La tienda se ve desde esta computadora.", 409)
    cloud.request_publish()
    return ok("Publicando la tienda… tarda un par de minutos.", cloud=cloud.status())
