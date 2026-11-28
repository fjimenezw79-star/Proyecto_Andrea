"""Acciones hechas sin señal: sin duplicados, con la hora real y en la bitácora.

Adaptado de AcuaGest DEMO 3.0 (``app/offline.py``).

* El dispositivo reenvía cada acción guardada con ``X-Client-Uid`` (identificador único), ``X-Client-Time``
  (hora real en que se hizo) y ``X-Offline: 1``.
* Si el servidor ya procesó ese identificador, devuelve la misma respuesta sin repetir la acción.
* La hora real se usa como fecha de la venta, del apartado, del abono o del cliente (si es razonable).
* Toda acción que modifica datos queda en la bitácora (quién, qué, cuándo y si llegó sin señal).
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta

from flask import Flask, current_app, g, request
from flask_login import current_user

from .db import begin_write, session
from .models import AuditLog, OfflineOp

UID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
MAX_AGE = timedelta(days=7)
MAX_FUTURE = timedelta(minutes=10)
# Tras 2 min se retoma una acción que quedó "procesando" (el proceso se cortó). Es seguro porque los servicios
# son idempotentes por el id que genera el dispositivo (venta, apartado, abono y cliente).
STALE = timedelta(minutes=2)
# Una acción cuenta como hecha sin señal solo si el dispositivo la hizo hace más de esto: así X-Offline
# no sirve para brincarse el stock ni para cambiar la fecha de una venta en vivo.
OFFLINE_MIN_AGE = timedelta(seconds=30)
KEEP_OPS = timedelta(days=30)
QUEUEABLE = {"sales.create", "layaways.create", "layaways.payment", "clients.create"}

AUDITED = {
    "online_orders.confirm": "Confirmó pedido en línea",
    "online_orders.charge": "Cobró pedido en línea",
    "online_orders.reject": "Rechazó pedido en línea",
    "sales.create": "Registró venta",
    "sales.cancel": "Canceló venta",
    "returns.create": "Registró devolución",
    "layaways.create": "Registró apartado",
    "layaways.payment": "Registró abono",
    "layaways.settle": "Liquidó apartado",
    "layaways.cancel": "Canceló apartado",
    "clients.create": "Registró cliente",
    "clients.update": "Editó cliente",
    "expenses.create": "Registró gasto",
    "expenses.update": "Editó gasto",
    "expenses.delete": "Eliminó gasto",
    "inventory.entries": "Registró entrada de mercancía",
    "inventory.adjustments": "Ajustó existencias",
    "cash.open_": "Abrió caja",
    "cash.close": "Hizo corte de caja",
    "catalog.create_product": "Dio de alta producto",
    "catalog.update_product": "Editó producto",
    "catalog.update_variant": "Cambió precio o código",
    "catalog.add_photos": "Agregó foto",
    "catalog.delete_photo": "Quitó foto",
    "catalog.create_category": "Creó categoría",
    "catalog.update_category": "Editó categoría",
    "settings.update": "Cambió la configuración",
    "auth.change_password": "Cambió su contraseña",
    "audit.review_alert": "Revisó alerta de stock",
}


def event_time() -> datetime:
    """Hora del hecho: la que mandó el dispositivo si la acción se hizo sin señal; si no, la actual."""
    try:
        if getattr(g, "offline_ok", False) and g.client_time:
            return g.client_time
    except RuntimeError:  # fuera de una petición (scripts)
        pass
    return datetime.now().replace(microsecond=0)


def is_offline() -> bool:
    """La acción llegó de la cola del dispositivo y se hizo sin señal (permite stock negativo con alerta)."""
    try:
        return bool(getattr(g, "offline_ok", False))
    except RuntimeError:
        return False


def _parse_client_time(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        t = datetime.fromisoformat(raw.strip().replace("Z", "")[:19])
    except ValueError:
        return None
    now = datetime.now()
    if t > now + MAX_FUTURE or t < now - MAX_AGE:
        return None
    return min(t, now).replace(microsecond=0)


def _before():
    g.client_uid = None
    g.client_time = None
    g.offline_ok = False
    g.replayed = False
    if request.method != "POST" or request.endpoint not in QUEUEABLE or not current_user.is_authenticated:
        return None
    g.client_time = _parse_client_time(request.headers.get("X-Client-Time"))
    g.offline_ok = (request.headers.get("X-Offline") == "1" and g.client_time is not None
                    and datetime.now() - g.client_time > OFFLINE_MIN_AGE)
    uid = (request.headers.get("X-Client-Uid") or "").strip()
    if not uid or not UID_RE.match(uid):
        return None
    begin_write()
    row = session.get(OfflineOp, uid)
    if row and (row.user_id != current_user.id or row.endpoint != request.endpoint):
        session.rollback()
        return current_app.response_class(
            json.dumps({"ok": False, "message": "Identificador de acción repetido."}), status=409, mimetype="application/json")
    if row and row.status == "done":
        session.rollback()
        g.replayed = True
        resp = current_app.response_class(row.response, status=row.http_status or 200, mimetype="application/json")
        resp.headers["X-Replayed"] = "1"
        return resp
    if row and row.status == "processing" and datetime.now() - row.received_at < STALE:
        session.rollback()
        return current_app.response_class(
            json.dumps({"ok": False, "message": "Esta acción se está procesando; se reintentará."}),
            status=409, mimetype="application/json")
    if row:
        session.delete(row)
        session.flush()
    session.add(OfflineOp(uid=uid, user_id=current_user.id, endpoint=request.endpoint, status="processing",
                          client_time=g.client_time, received_at=datetime.now().replace(microsecond=0),
                          offline=g.offline_ok))
    session.commit()
    g.client_uid = uid
    return None


def _after(resp):
    try:
        uid = getattr(g, "client_uid", None)
        replayed = getattr(g, "replayed", False)
        ok = 200 <= resp.status_code < 300
        if uid and not replayed:
            session.rollback()
            begin_write()
            row = session.get(OfflineOp, uid)
            if row is not None:
                if ok:
                    row.status, row.response, row.http_status = "done", resp.get_data(as_text=True), resp.status_code
                else:  # error de negocio: se libera para que el dispositivo lo marque y se pueda reintentar
                    session.delete(row)
            session.commit()
        if ok and not replayed:
            _audit(resp)
    except Exception:  # la bitácora nunca debe romper la respuesta
        session.rollback()
        current_app.logger.exception("No se pudo registrar la bitácora")
    return resp


def _audit(resp) -> None:
    action = AUDITED.get(request.endpoint or "")
    if not action or not current_user.is_authenticated:
        return
    data = resp.get_json(silent=True) if resp.is_json else None
    detail, entity = "", next(iter((request.view_args or {}).values()), None)
    if isinstance(data, dict):
        detail = data.get("message") or ""
        for key in ("order", "sale", "layaway", "client", "expense", "product", "return", "session", "variant", "category"):
            obj = data.get(key)
            if isinstance(obj, dict):
                entity = entity or obj.get("id")
                parts = [f"#{obj['folio']}"] if obj.get("folio") is not None else [str(obj["name"])] if obj.get("name") else []
                cents = next((obj[k] for k in ("total_cents", "amount_cents") if isinstance(obj.get(k), int)), None)
                if cents is not None:
                    parts.append(f"${cents / 100:,.2f}")
                detail = " · ".join(parts) or detail
                break
    session.rollback()
    begin_write()
    session.add(AuditLog(user_id=current_user.id, action=action, entity_id=str(entity)[:64] if entity else None,
                         detail=str(detail)[:300], offline=is_offline(),
                         client_time=g.client_time if is_offline() else None))
    session.commit()


def purge_old(app: Flask) -> None:
    """Borra los registros de acciones de hace más de 30 días (sus respuestas ya no hacen falta)."""
    with app.app_context():
        begin_write()
        session.query(OfflineOp).filter(OfflineOp.received_at < datetime.now() - KEEP_OPS).delete()
        session.commit()
        session.remove()


def init_app(app: Flask) -> None:
    app.before_request(_before)
    app.after_request(_after)
    purge_old(app)
