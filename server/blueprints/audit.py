"""/api/audit (bitácora) y /api/stock-alerts (stock negativo por ventas sin señal). Solo administrador."""
from __future__ import annotations

from datetime import datetime

from flask import Blueprint, request
from flask_login import current_user, login_required

from ..api_util import fail, ok
from ..db import begin_write, session
from ..models import AuditLog, StockAlert, User
from ..security import admin_required

bp = Blueprint("audit", __name__, url_prefix="/api")


@bp.get("/audit")
@admin_required
def entries():
    page = max(1, request.args.get("page", 1, type=int))
    names = {u.id: (u.full_name or u.username) for u in session.query(User).all()}
    rows = session.query(AuditLog).order_by(AuditLog.id.desc()).offset((page - 1) * 100).limit(100).all()
    return ok(entries=[{"id": a.id, "at": a.at.isoformat(), "user": names.get(a.user_id), "action": a.action,
                        "entity_id": a.entity_id, "detail": a.detail, "offline": a.offline,
                        "client_time": a.client_time.isoformat() if a.client_time else None} for a in rows])


@bp.get("/stock-alerts")
@admin_required
def alerts():
    rows = session.query(StockAlert).filter(StockAlert.reviewed_at.is_(None)).order_by(StockAlert.id.desc()).all()
    return ok(alerts=[{"id": a.id, "variant_id": a.variant_id, "sku": a.variant.sku, "product": a.variant.product.name,
                       "product_id": a.variant.product_id, "stock_after": a.stock_after, "stock_now": a.variant.stock,
                       "ref_type": a.ref_type, "ref_id": a.ref_id, "created_at": a.created_at.isoformat()} for a in rows])


@bp.post("/stock-alerts/<int:alert_id>/review")
@admin_required
def review_alert(alert_id: int):
    begin_write()
    a = session.get(StockAlert, alert_id)
    if not a:
        session.rollback()
        return fail("La alerta no existe.", 404)
    a.reviewed_by, a.reviewed_at = current_user.id, datetime.now().replace(microsecond=0)
    session.commit()
    return ok("Alerta marcada como revisada.")


@bp.post("/audit/discard")
@login_required
def discard():
    """El dispositivo descartó una acción sin señal que no se pudo registrar: queda constancia en la bitácora."""
    data = request.get_json(silent=True) or {}
    label = str(data.get("label") or "").strip()[:150]
    reason = str(data.get("reason") or "").strip()[:200]
    if not label or not reason:
        return fail("Escribe por qué se descarta.", 400, field="reason")
    import json

    payload = json.dumps(data.get("payload"), ensure_ascii=False)[:1500]
    begin_write()
    session.add(AuditLog(user_id=current_user.id, action="Descartó acción sin señal", entity_id=str(data.get("kind") or "")[:64],
                         detail=f"{label} · Motivo: {reason} · Datos: {payload}"[:2000], offline=True))
    session.commit()
    return ok("Descarte registrado en la bitácora.")
