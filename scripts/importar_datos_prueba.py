"""Carga el catálogo de prueba de ``datos_prueba/`` (58 productos con foto, precio y stock).

    python -m scripts.importar_datos_prueba

Se puede correr varias veces: los códigos que ya existen se omiten. Si un código ya lo usa
otro producto distinto, se reporta en ``conflictos`` y no se toca.
"""
from __future__ import annotations

import json
from pathlib import Path

from scripts._files import close_all, file_storage

DEPTS = ["Mochilas", "Termos", "Cobijas", "Relojes", "Útiles"]
COST_RATIO = 0.55


def run(app, carpeta: Path = Path("datos_prueba")) -> dict:
    from server.db import session
    from server.models import Category, Variant
    from server.services import catalog

    carpeta = Path(carpeta)
    productos = json.loads((carpeta / "productos.json").read_text(encoding="utf-8"))
    creados = omitidos = 0
    conflictos: list[str] = []
    with app.app_context():
        cats = {}
        for name in DEPTS:
            c = session.query(Category).filter_by(name=name, parent_id=None).first()
            cats[name] = c or catalog.create_category(name)
        for p in productos:
            existing = session.query(Variant).filter_by(sku=p["code"]).first()
            if existing:
                if existing.product.name == p["name"]:
                    omitidos += 1
                else:
                    conflictos.append(p["code"])
                continue
            files = [file_storage(carpeta / f) for f in p["imgs"]]
            try:
                catalog.create_product(
                    {"name": p["name"], "description": p.get("sub", ""), "category_id": cats[p["dept"]].id,
                     "price_cents": int(p["price"]) * 100, "cost_cents": round(int(p["price"]) * COST_RATIO) * 100},
                    files, skus=[p["code"]], import_stock=int(p.get("stock") or 0))
            finally:
                close_all(files)
            creados += 1
    return {"creados": creados, "omitidos": omitidos, "conflictos": conflictos}


if __name__ == "__main__":  # pragma: no cover
    from server import create_app

    print(run(create_app(), Path(__file__).resolve().parents[1] / "datos_prueba"))
