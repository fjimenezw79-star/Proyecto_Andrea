"""Catálogo: categorías, productos y variantes."""
from __future__ import annotations

import re
import unicodedata

from ..api_util import ValidationError
from ..db import session
from ..models import Category


def slugify(text: str) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-") or "categoria"


def _unique_slug(name: str, exclude_id: int | None = None) -> str:
    base = slugify(name)
    slug, n = base, 1
    while True:
        q = session.query(Category).filter_by(slug=slug)
        if exclude_id:
            q = q.filter(Category.id != exclude_id)
        if not q.first():
            return slug
        n += 1
        slug = f"{base}-{n}"


def _clean_name(name) -> str:
    name = str(name or "").strip()
    if not name:
        raise ValidationError("Escribe el nombre de la categoría.", "name")
    if len(name) > 80:
        raise ValidationError("El nombre es demasiado largo (máximo 80 caracteres).", "name")
    return name


def _check_parent(parent_id, category_id: int | None = None) -> int | None:
    if parent_id in (None, ""):
        return None
    parent = session.get(Category, int(parent_id))
    if not parent:
        raise ValidationError("La categoría padre no existe.", "parent_id")
    node = parent
    while node is not None:
        if category_id is not None and node.id == category_id:
            raise ValidationError("Una categoría no puede quedar dentro de sí misma.", "parent_id")
        node = node.parent
    return parent.id


def create_category(name: str, parent_id: int | None = None) -> Category:
    name = _clean_name(name)
    c = Category(name=name, slug=_unique_slug(name), parent_id=_check_parent(parent_id))
    session.add(c)
    session.commit()
    return c


def update_category(category_id: int, data: dict) -> Category:
    c = session.get(Category, category_id)
    if not c:
        raise ValidationError("La categoría no existe.", "id")
    if "name" in data:
        c.name = _clean_name(data["name"])
        c.slug = _unique_slug(c.name, exclude_id=c.id)
    if "parent_id" in data:
        c.parent_id = _check_parent(data["parent_id"], c.id)
    if "sort" in data:
        c.sort = int(data["sort"])
    if "active" in data:
        c.active = bool(data["active"])
    session.commit()
    return c


def category_dict(c: Category) -> dict:
    return {"id": c.id, "name": c.name, "slug": c.slug, "parent_id": c.parent_id, "sort": c.sort, "active": c.active}


def category_tree() -> list[dict]:
    cats = session.query(Category).order_by(Category.sort, Category.id).all()
    nodes = {c.id: {**category_dict(c), "children": []} for c in cats}
    roots = []
    for c in cats:
        (nodes[c.parent_id]["children"] if c.parent_id in nodes else roots).append(nodes[c.id])
    return roots
