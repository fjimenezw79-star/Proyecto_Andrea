"""/api/connect: el enlace (y su QR) para conectar celulares y tablets al sistema. Solo administrador."""
from __future__ import annotations

import io

from flask import Blueprint, Response, current_app

from ..api_util import ok
from ..netinfo import local_ip
from ..security import admin_required

bp = Blueprint("connect", __name__, url_prefix="/api/connect")


def connection() -> dict:
    cfg = current_app.config
    lan = f"http://{local_ip()}:{cfg['PORT']}"
    public = (cfg.get("PUBLIC_URL") or "").strip().rstrip("/")
    tunnel = current_app.extensions.get("tunnel")
    if public:
        url, kind = public, "fixed"
    elif tunnel is not None and getattr(tunnel, "url", None):
        url, kind = tunnel.url, "tunnel"
    else:
        url, kind = lan, "lan"
    return {"url": url, "kind": kind, "lan_url": lan, "offline_capable": url.startswith("https://"),
            "temporary": kind == "tunnel" and getattr(tunnel, "mode", "prueba") != "permanente"}


@bp.get("")
@admin_required
def info():
    return ok(**connection())


@bp.get("/qr.svg")
@admin_required
def qr():
    import qrcode
    from qrcode.image.svg import SvgPathImage

    img = qrcode.make(connection()["url"], image_factory=SvgPathImage, box_size=12, border=2)
    buf = io.BytesIO()
    img.save(buf)
    resp = Response(buf.getvalue(), mimetype="image/svg+xml")
    resp.headers["Cache-Control"] = "no-store"
    return resp
