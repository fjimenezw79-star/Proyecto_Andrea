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
    q = (select(ProductPhoto.id, ProductPhoto.product_id, ProductPhoto.filename)
         .join(Product, Product.id == ProductPhoto.product_id)
         .where(Product.active.is_(True), ProductPhoto.id.not_in(have)))
    product = request.args.get("product", type=int)
    if product:
        q = q.where(ProductPhoto.product_id == product)
    rows = session.execute(q.order_by(ProductPhoto.id).limit(2000)).all()
    return ok(model=MODEL, dim=DIM,
              photos=[{"photo_id": i, "product_id": p, "url": f"/uploads/{f}"} for i, p, f in rows])


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
