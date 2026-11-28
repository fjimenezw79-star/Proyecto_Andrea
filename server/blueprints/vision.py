"""/api/vision: huellas de fotos para reconocer productos con la cámara y botón "Buscar con IA".

Las huellas las calcula el navegador (MediaPipe, MobileNet V3 small); el servidor solo las guarda y las reparte.
"""
from __future__ import annotations

import base64
import binascii

from flask import Blueprint, request
from flask_login import login_required
from sqlalchemy import select

from ..api_util import fail, ok
from ..db import begin_write, session
from ..models import PhotoEmbedding, Product, ProductPhoto
from ..security import admin_required

bp = Blueprint("vision", __name__, url_prefix="/api/vision")

MODEL = "mobilenet_v3_small"
DIM = 1024
MAX_ITEMS = 200


@bp.get("/index")
@login_required
def index():
    """Índice para comparar en el dispositivo (también sin señal): una huella por foto de producto activo."""
    rows = session.execute(
        select(PhotoEmbedding.photo_id, ProductPhoto.product_id, PhotoEmbedding.vector)
        .join(ProductPhoto, ProductPhoto.id == PhotoEmbedding.photo_id)
        .join(Product, Product.id == ProductPhoto.product_id)
        .where(PhotoEmbedding.model == MODEL, Product.active.is_(True))
        .order_by(PhotoEmbedding.photo_id)).all()
    return ok(model=MODEL, dim=DIM, items=[{"photo_id": a, "product_id": b, "v": v} for a, b, v in rows])


@bp.get("/missing")
@admin_required
def missing():
    """Fotos que todavía no tienen huella del modelo actual (para prepararlas desde el navegador)."""
    have = select(PhotoEmbedding.photo_id).where(PhotoEmbedding.model == MODEL)
    q = (select(ProductPhoto.id, ProductPhoto.product_id, ProductPhoto.filename, ProductPhoto.thumb_filename)
         .join(Product, Product.id == ProductPhoto.product_id)
         .where(Product.active.is_(True), ProductPhoto.id.not_in(have)))
    product = request.args.get("product", type=int)
    if product:
        q = q.where(ProductPhoto.product_id == product)
    rows = session.execute(q.order_by(ProductPhoto.id).limit(2000)).all()
    return ok(model=MODEL, dim=DIM,
              photos=[{"photo_id": i, "product_id": p, "url": f"/uploads/{f}", "thumb_url": f"/uploads/{t}"}
                      for i, p, f, t in rows])


def _decode(v) -> bool:
    if not isinstance(v, str):
        return False
    try:
        return len(base64.b64decode(v, validate=True)) == DIM
    except (binascii.Error, ValueError):
        return False


@bp.put("/embeddings")
@admin_required
def save_embeddings():
    d = request.get_json(silent=True) or {}
    if d.get("model") != MODEL:
        return fail("La huella es de otro modelo. Recarga la página e inténtalo de nuevo.", 400, "model")
    items = d.get("items")
    if not isinstance(items, list) or not 1 <= len(items) <= MAX_ITEMS:
        return fail(f"Envía de 1 a {MAX_ITEMS} huellas.", 400, "items")
    for it in items:
        if not isinstance(it, dict) or not isinstance(it.get("photo_id"), int) or not _decode(it.get("v")):
            return fail("Huella no válida.", 400, "items")
    begin_write()
    ids = {it["photo_id"] for it in items}
    found = set(session.scalars(select(ProductPhoto.id).where(ProductPhoto.id.in_(ids))))
    if found != ids:
        session.rollback()
        return fail("Una de las fotos ya no existe.", 404, "photo_id")
    for it in items:
        session.merge(PhotoEmbedding(photo_id=it["photo_id"], model=MODEL, dim=DIM, vector=it["v"]))
    session.commit()
    return ok("Huellas guardadas.", saved=len(items))


# ---------- Botón "✨ Buscar con IA" ----------

def _ai_status() -> dict:
    from flask import current_app
    from sqlalchemy import func

    from .. import ai
    from ..models import AiQuery
    from .settings import get_settings

    limit = int(get_settings()["ai_monthly_limit"])
    used = session.scalar(select(func.count(AiQuery.id)).where(
        AiQuery.at >= ai.month_start(), AiQuery.status.in_(("pending", "ok")))) or 0
    has_key = bool(current_app.config.get("ANTHROPIC_API_KEY"))
    return {"enabled": has_key and used < limit, "configured": has_key, "used": used, "limit": limit,
            "model": current_app.config.get("ANTHROPIC_MODEL")}


@bp.get("/ai")
@login_required
def ai_status():
    return ok(**_ai_status())


@bp.post("/ai")
@login_required
def ai_search():
    from flask import current_app
    from flask_login import current_user
    from sqlalchemy.orm import selectinload

    from .. import ai
    from ..models import AiQuery

    if not current_app.config.get("ANTHROPIC_API_KEY"):
        return fail("La búsqueda con IA no está activada en este negocio.", 503)
    d = request.get_json(silent=True) or {}
    jpeg = ai.clean_query_image(d.get("image"))
    ids = d.get("candidates")
    if (not isinstance(ids, list) or not 1 <= len(ids) <= ai.MAX_CANDIDATES
            or not all(isinstance(i, int) and not isinstance(i, bool) for i in ids)):
        return fail(f"Envía de 1 a {ai.MAX_CANDIDATES} productos candidatos.", 400, "candidates")
    ids = list(dict.fromkeys(ids))
    products = {p.id: p for p in session.query(Product).options(selectinload(Product.photos), selectinload(Product.variants))
                .filter(Product.id.in_(ids), Product.active.is_(True))}
    if len(products) != len(ids):
        return fail("Uno de los productos ya no existe.", 400, "candidates")
    ordered = [products[i] for i in ids]

    # Se aparta el lugar antes de llamar a la API: dos dispositivos a la vez no pasan el límite
    begin_write()
    st = _ai_status()
    if st["used"] >= st["limit"]:
        session.rollback()
        return fail("Ya se usaron las consultas de IA de este mes. El administrador puede subir el límite en Configuración.", 429)
    q = AiQuery(user_id=current_user.id, status="pending")
    session.add(q)
    session.commit()
    qid = q.id

    try:
        idx, reason, tin, tout = ai.ask(current_app, jpeg, ordered)
    except ai.AiUnavailable:
        begin_write()
        session.get(AiQuery, qid).status = "error"
        session.commit()
        return fail("La IA no respondió. Revisa el internet e inténtalo de nuevo.", 502)
    match = ordered[idx].id if idx is not None else None
    begin_write()
    row = session.get(AiQuery, qid)
    row.status, row.matched_product_id, row.input_tokens, row.output_tokens = "ok", match, tin, tout
    session.commit()
    return ok(match=match, reason=reason, **{k: v for k, v in _ai_status().items() if k in ("used", "limit")})
