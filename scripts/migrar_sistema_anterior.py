"""Pasa los productos del sistema anterior (``bazarges_data.db`` + ``static/uploads``) al sistema nuevo.

    python -m scripts.migrar_sistema_anterior "C:\\ruta\\PROYECTO ANDREA_4\\bazarges_data.db"

No se importan los usuarios ni sus contraseñas. Las ventas y apartados viejos se cuentan
para pasarlos en la etapa 3. Se puede correr varias veces sin duplicar productos.
"""
from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

from scripts._files import close_all, file_storage


def _table_count(con: sqlite3.Connection, table: str) -> int:
    try:
        return con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]  # noqa: S608 (nombre fijo)
    except sqlite3.Error:
        return 0


def run(app, ruta_db: Path) -> dict:
    from server.api_util import ConflictError, ValidationError
    from server.db import session
    from server.models import Category, Variant
    from server.services import catalog

    ruta_db = Path(ruta_db)
    uploads = ruta_db.parent / "static" / "uploads"
    con = sqlite3.connect(ruta_db)
    con.row_factory = sqlite3.Row
    creados, sin_foto, con_error = 0, [], []
    try:
        with app.app_context():
            def cat(name, parent=None):
                q = session.query(Category).filter_by(name=name, parent_id=parent.id if parent else None).first()
                return q or catalog.create_category(name, parent.id if parent else None)

            escolar = cat("Escolar")
            mochilas, utiles = cat("Mochilas", escolar), cat("Útiles", escolar)
            for row in con.execute("SELECT * FROM products ORDER BY id"):
                # sin código anterior se usa ANT-<id> para poder reconocerlo si la migración se repite
                code = (row["custom_id"] or "").strip() or f"ANT-{row['id']}"
                if session.query(Variant).filter((Variant.barcode == code) | (Variant.sku == code)).first():
                    continue
                fotos = [uploads / r["filename"] for r in
                         con.execute("SELECT filename FROM product_images WHERE product_id=? ORDER BY id", (row["id"],))]
                fotos = [f for f in fotos if f.exists()]
                if not fotos:
                    sin_foto.append(row["name"])
                    continue
                texto = (row["category"] or "").lower()
                categoria = mochilas if ("mochila" in texto or "combo" in texto) else utiles
                files = [file_storage(f) for f in fotos]
                try:
                    catalog.create_product(
                        {"name": row["name"], "description": row["description"] or "", "category_id": categoria.id,
                         "price_cents": round(float(row["price"] or 0) * 100),
                         "cost_cents": round(float(row["cost_price"] or 0) * 100), "barcode": code}, files,
                        import_stock=max(0, int(row["stock"] or 0)))
                except (ValidationError, ConflictError):
                    con_error.append(row["name"])  # se reporta y se sigue con los demás
                    continue
                finally:
                    close_all(files)
                creados += 1
        return {"productos": creados, "sin_foto": sin_foto, "con_error": con_error, "ventas_omitidas": _table_count(con, "sales"),
                "apartados_omitidos": _table_count(con, "layaways")}
    finally:
        con.close()


if __name__ == "__main__":  # pragma: no cover
    if len(sys.argv) != 2:
        print("Uso: python -m scripts.migrar_sistema_anterior <ruta de bazarges_data.db>")
        sys.exit(1)
    from server import create_app

    print(run(create_app(), Path(sys.argv[1])))
