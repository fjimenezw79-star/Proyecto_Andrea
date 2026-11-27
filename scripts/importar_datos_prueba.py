"""Carga el catálogo de prueba de ``datos_prueba/`` (58 productos con foto, precio y stock).

    python -m scripts.importar_datos_prueba

Se puede correr varias veces: los códigos que ya existen se omiten.
"""
from __future__ import annotations

import json
from pathlib import Path

from scripts._files import close_all, file_storage

DEPTS = ["Mochilas", "Termos", "Cobijas", "Relojes", "Útiles"]
COST_RATIO = 0.55


def run(app, carpeta: Path = Path("datos_prueba")) -> dict:
    from server.db import begin_write, session
    from server.models import Category, Variant
    from server.services import catalog
    from server.services.inventory import move

    carpeta = Path(carpeta)
    productos = json.loads((carpeta / "productos.json").read_text(encoding="utf-8"))
    creados = omitidos = 0
    with app.app_context():
        cats = {}
        for name in DEPTS:
            c = session.query(Category).filter_by(name=name, parent_id=None).first()
            cats[name] = c or catalog.create_category(name)
        for p in productos:
            if session.query(Variant).filter_by(sku=p["code"]).first():
                omitidos += 1
                continue
            price = int(p["price"]) * 100
            cost = round(int(p["price"]) * COST_RATIO) * 100
            files = [file_storage(carpeta / f) for f in p["imgs"]]
            try:
                prod = catalog.create_product(
                    {"name": p["name"], "description": p.get("sub", ""), "category_id": cats[p["dept"]].id,
                     "price_cents": price, "cost_cents": cost}, files, skus=[p["code"]])
            finally:
                close_all(files)
            if int(p.get("stock") or 0) > 0:
                begin_write()
                move(prod.variants[0].id, int(p["stock"]), "import", None, "Datos de prueba")
                session.commit()
            creados += 1
    return {"creados": creados, "omitidos": omitidos}


if __name__ == "__main__":  # pragma: no cover
    from server import create_app

    print(run(create_app(), Path(__file__).resolve().parents[1] / "datos_prueba"))
