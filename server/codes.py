"""Códigos internos de producto: MA + 6 dígitos (se imprimen en Code 128)."""
from __future__ import annotations

import re

from sqlalchemy import func

from .db import session
from .models import Variant

SKU_RE = re.compile(r"^MA(\d{6})$")


def next_sku() -> str:
    session.flush()
    top = session.query(func.max(Variant.sku)).filter(Variant.sku.like("MA______")).scalar()
    n = int(SKU_RE.match(top).group(1)) + 1 if top and SKU_RE.match(top) else 1
    return f"MA{n:06d}"
