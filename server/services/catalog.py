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
    from ..api_util import strict_int
    if parent_id in (None, ""):
        return None
    parent = session.get(Category, strict_int(parent_id, "parent_id", 1))
    if not parent:
        raise ValidationError("La categoría padre no existe.", "parent_id")
    node = parent
    while node is not None:
        if category_id is not None and node.id == category_id:
            raise ValidationError("Una categoría no puede quedar dentro de sí misma.", "parent_id")
        node = node.parent
    return parent.id


def create_category(name: str, parent_id: int | None = None) -> Category:
    from ..db import begin_write
    name = _clean_name(name)
    begin_write()
    c = Category(name=name, slug=_unique_slug(name), parent_id=_check_parent(parent_id))
    session.add(c)
    session.commit()
    return c


def update_category(category_id: int, data: dict) -> Category:
    from ..db import begin_write
    begin_write()
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


# ---------------------------------------------------------------------------
# Productos y variantes
# ---------------------------------------------------------------------------
from pathlib import Path  # noqa: E402

from flask import current_app  # noqa: E402
from sqlalchemy import or_  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402

from ..api_util import ConflictError, strict_int  # noqa: E402
from ..db import begin_write  # noqa: E402
from sqlalchemy import func  # noqa: E402
from ..codes import next_sku  # noqa: E402
from ..models import Product, ProductPhoto, Variant  # noqa: E402
from ..photos import delete_files, save_photo  # noqa: E402
from . import inventory as _inventory  # noqa: E402

PAGE_SIZE = 60


def _money(value, field: str) -> int:
    return strict_int(value, field, minimum=0)


def _attrs(value) -> dict:
    if value in (None, ""):
        return {}
    if not isinstance(value, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in value.items()):
        raise ValidationError("Los atributos deben ser texto, por ejemplo {\"Color\": \"Azul\"}.", "attrs")
    return {k.strip()[:30]: v.strip()[:40] for k, v in value.items() if k.strip() and v.strip()}


def _barcode(value) -> str | None:
    code = str(value or "").strip()
    if not code:
        return None
    if len(code) > 40 or not re.fullmatch(r"[0-9A-Za-z\-]+", code):
        raise ValidationError("El código solo puede tener letras, números y guiones.", "barcode")
    if re.fullmatch(r"MA\d{6}", code, re.I):
        raise ValidationError("Los códigos MA###### los asigna el sistema; usa el código de fábrica.", "barcode")
    return code


def _check_barcode_free(code: str | None, variant_id: int | None = None) -> None:
    if not code:
        return
    up = code.upper()
    q = session.query(Variant).filter(or_(func.upper(Variant.barcode) == up, Variant.sku == up))
    if variant_id:
        q = q.filter(Variant.id != variant_id)
    if q.first():
        raise ConflictError("Ese código ya pertenece a otro producto.")


def _category(value) -> Category | None:
    if value in (None, "", 0):
        return None
    return session.get(Category, strict_int(value, "category_id", 1))


def _upload_dir() -> Path:
    return Path(current_app.config["UPLOAD_DIR"])


def create_product(data: dict, photos: list, user=None, skus: list[str] | None = None,
                   import_stock: int = 0) -> Product:
    """``skus`` e ``import_stock`` solo los usan los importadores: conservan los códigos existentes y
    cargan el stock inicial en la misma transacción que el producto."""
    if not isinstance(data, dict):
        raise ValidationError("Datos del producto no válidos.", "data")
    name = str(data.get("name") or "").strip()
    if not name:
        raise ValidationError("Escribe el nombre del producto.", "name")
    if len(name) > 120:
        raise ValidationError("El nombre es demasiado largo (máximo 120 caracteres).", "name")
    cat = _category(data.get("category_id"))
    if not cat:
        raise ValidationError("Elige una categoría.", "category_id")
    photos = [p for p in photos if p and p.filename]
    if not photos:
        raise ValidationError("Agrega al menos una foto del producto.", "photos")
    specs = data.get("variants") or []
    hidden = not specs
    if hidden:
        specs = [{"attrs": {}, "price_cents": data.get("price_cents"), "cost_cents": data.get("cost_cents", 0),
                  "barcode": data.get("barcode")}]
    rows = []
    for s in specs:
        rows.append((_attrs(s.get("attrs")), _money(s.get("price_cents"), "price_cents"),
                     _money(s.get("cost_cents", 0), "cost_cents"), _barcode(s.get("barcode"))))
    codes = [r[3] for r in rows if r[3]]
    if len(codes) != len(set(codes)):
        raise ConflictError("Ese código ya pertenece a otro producto.")
    for c in codes:
        _check_barcode_free(c)

    saved: list[str] = []
    try:
        files = []
        for f in photos:  # la conversión de fotos va fuera de la transacción de escritura
            full, thumb = save_photo(f, _upload_dir())
            saved += [full, thumb]
            files.append((full, thumb))
        begin_write()
        p = Product(name=name, description=str(data.get("description") or "").strip()[:2000], category_id=cat.id,
                    online=bool(data.get("online", True)))
        session.add(p)
        for i, (full, thumb) in enumerate(files):
            p.photos.append(ProductPhoto(filename=full, thumb_filename=thumb, position=i))
        for i, (attrs, price, cost, code) in enumerate(rows):
            sku = skus[i] if skus and i < len(skus) else next_sku()
            v = Variant(product=p, sku=sku, barcode=code, attrs=attrs, price_cents=price, cost_cents=cost,
                        stock=0, hidden=hidden)
            session.add(v)
            session.flush()
        if import_stock > 0:
            _inventory.move(p.variants[0].id, import_stock, "import", None, "Carga inicial")
        session.commit()
        return p
    except Exception:
        session.rollback()
        delete_files(_upload_dir(), saved)
        raise


def get_product(product_id: int) -> Product:
    p = session.get(Product, product_id)
    if not p:
        raise ValidationError("El producto no existe.", "id")
    return p


def update_product(product_id: int, data: dict) -> Product:
    begin_write()
    p = get_product(product_id)
    if "name" in data:
        name = str(data["name"] or "").strip()
        if not name:
            raise ValidationError("Escribe el nombre del producto.", "name")
        p.name = name[:120]
    if "description" in data:
        p.description = str(data["description"] or "").strip()[:2000]
    if "category_id" in data:
        cat = _category(data["category_id"])
        if not cat:
            raise ValidationError("Elige una categoría.", "category_id")
        p.category_id = cat.id
    for flag in ("online", "active"):
        if flag in data:
            setattr(p, flag, bool(data[flag]))
    session.commit()
    return p


def add_photos(product_id: int, photos: list) -> Product:
    p = get_product(product_id)
    photos = [f for f in photos if f and f.filename]
    if not photos:
        raise ValidationError("Agrega al menos una foto.", "photos")
    saved: list[str] = []
    try:
        files = []
        for f in photos:
            full, thumb = save_photo(f, _upload_dir())
            saved += [full, thumb]
            files.append((full, thumb))
        begin_write()
        p = get_product(product_id)
        start = max((ph.position for ph in p.photos), default=-1) + 1
        for i, (full, thumb) in enumerate(files):
            p.photos.append(ProductPhoto(filename=full, thumb_filename=thumb, position=start + i))
        session.commit()
        return p
    except Exception:
        session.rollback()
        delete_files(_upload_dir(), saved)
        raise


def delete_photo(product_id: int, photo_id: int) -> Product:
    begin_write()
    p = get_product(product_id)
    ph = next((x for x in p.photos if x.id == photo_id), None)
    if not ph:
        raise ValidationError("La foto no existe.", "photo_id")
    if len(p.photos) <= 1:
        raise ValidationError("El producto debe conservar al menos una foto.", "photos")
    names = [ph.filename, ph.thumb_filename]
    p.photos.remove(ph)
    session.commit()
    delete_files(_upload_dir(), names)
    return p


def update_variant(variant_id: int, data: dict) -> Variant:
    begin_write()
    v = session.get(Variant, variant_id)
    if not v:
        raise ValidationError("La variante no existe.", "id")
    if "price_cents" in data:
        v.price_cents = _money(data["price_cents"], "price_cents")
    if "cost_cents" in data:
        v.cost_cents = _money(data["cost_cents"], "cost_cents")
    if "attrs" in data:
        v.attrs = _attrs(data["attrs"])
    if "active" in data:
        v.active = bool(data["active"])
    if "barcode" in data:
        code = _barcode(data["barcode"])
        _check_barcode_free(code, v.id)
        v.barcode = code
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise ConflictError("Ese código ya pertenece a otro producto.") from None
    return v


def lookup(code: str) -> Variant:
    code = str(code or "").strip()
    up = code.upper()
    v = (session.query(Variant).filter(or_(Variant.sku == up, func.upper(Variant.barcode) == up))
         .order_by(Variant.active.desc(), Variant.id).first()) if code else None
    if not v:
        raise LookupError("No encontramos ningún producto con ese código.")
    if not v.active or not v.product.active:
        raise LookupError("Ese producto está dado de baja.")
    return v


def _descendants(category_id: int) -> list[int]:
    ids, frontier = [category_id], [category_id]
    while frontier:
        frontier = [c.id for c in session.query(Category).filter(Category.parent_id.in_(frontier))]
        ids += frontier
    return ids


def list_products(q: str = "", category_id: int | None = None, online: bool | None = None, page: int = 1):
    query = session.query(Product).filter(Product.active.is_(True))
    if q:
        like = f"%{q.strip()}%"
        query = query.outerjoin(Variant).filter(or_(Product.name.ilike(like), Variant.sku.ilike(like),
                                                    Variant.barcode == q.strip())).distinct()
    if category_id:
        query = query.filter(Product.category_id.in_(_descendants(category_id)))
    if online is not None:
        query = query.filter(Product.online.is_(online))
    total = query.count()
    items = query.order_by(Product.name, Product.id).offset((max(page, 1) - 1) * PAGE_SIZE).limit(PAGE_SIZE).all()
    return items, total


def variant_dict(v: Variant, with_cost: bool) -> dict:
    d = {"id": v.id, "sku": v.sku, "barcode": v.barcode, "attrs": v.attrs or {}, "price_cents": v.price_cents,
         "stock": v.stock, "hidden": v.hidden, "active": v.active}
    if with_cost:
        d["cost_cents"] = v.cost_cents
    return d


def product_dict(p: Product, with_cost: bool = False) -> dict:
    variants = [variant_dict(v, with_cost) for v in p.variants]
    return {"id": p.id, "name": p.name, "description": p.description, "category_id": p.category_id,
            "category": p.category.name if p.category else "", "online": p.online, "active": p.active,
            "photos": [{"id": ph.id, "url": f"/uploads/{ph.filename}", "thumb_url": f"/uploads/{ph.thumb_filename}"}
                       for ph in p.photos],
            "variants": variants, "stock_total": sum(v["stock"] for v in variants if v["active"])}
