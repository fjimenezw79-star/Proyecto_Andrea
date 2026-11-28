"""/api/settings: datos del negocio que se muestran en tienda, tickets y etiquetas."""
from __future__ import annotations

from flask import Blueprint, request
from flask_login import login_required

from ..api_util import fail, ok
from ..db import begin_write, session
from ..models import Setting
from ..security import admin_required

bp = Blueprint("settings", __name__, url_prefix="/api/settings")

DEFAULT_SETTINGS = {
    "business_name": "Modas Andrea",
    "business_subtitle": "Yuda",
    "whatsapp": "",
    "address": "",
    "ticket_width_mm": 58,
    "label_size": "50x25",
    "low_stock_threshold": 2,
    "ticket_footer": "¡Gracias por tu compra!",
    "ai_monthly_limit": 100,
}

RANGES = {"ticket_width_mm": (40, 112), "low_stock_threshold": (0, 1000), "ai_monthly_limit": (0, 10_000)}
CHOICES = {"label_size": ("50x25", "carta-30", "carta-20", "carta-10")}
MAX_LEN = {"ticket_footer": 200, "business_name": 80, "business_subtitle": 80, "whatsapp": 20, "address": 200}


def get_settings() -> dict:
    out = dict(DEFAULT_SETTINGS)
    out.update({s.key: s.value for s in session.query(Setting).all() if s.key in DEFAULT_SETTINGS})
    for k, options in CHOICES.items():
        if out[k] not in options:  # valor de una versión anterior (por ejemplo "carta")
            out[k] = DEFAULT_SETTINGS[k]
    return out


@bp.get("")
@login_required
def read():
    return ok(settings=get_settings())


@bp.put("")
@admin_required
def update():
    data = request.get_json(silent=True) or {}
    unknown = [k for k in data if k not in DEFAULT_SETTINGS]
    if unknown:
        return fail(f"Configuración desconocida: {', '.join(unknown)}.", 400, unknown[0])
    begin_write()
    for k, v in data.items():
        if isinstance(v, bool) or not isinstance(v, type(DEFAULT_SETTINGS[k])):
            return fail("Valor no válido.", 400, k)
        if k in RANGES and not RANGES[k][0] <= v <= RANGES[k][1]:
            return fail(f"El valor debe estar entre {RANGES[k][0]} y {RANGES[k][1]}.", 400, k)
        if k in CHOICES and v not in CHOICES[k]:
            return fail("Elige una de las opciones.", 400, k)
        if k in MAX_LEN and len(v) > MAX_LEN[k]:
            return fail(f"Máximo {MAX_LEN[k]} caracteres.", 400, k)
        session.merge(Setting(key=k, value=v))
    session.commit()
    return ok("Configuración guardada.", settings=get_settings())
