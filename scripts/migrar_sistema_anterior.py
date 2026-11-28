"""Pasa los productos del sistema anterior (``bazarges_data.db`` + ``static/uploads``) al sistema nuevo.

    python -m scripts.migrar_sistema_anterior "C:\\ruta\\PROYECTO ANDREA_4\\bazarges_data.db"

No se importan los usuarios ni sus contraseñas. También pasa las ventas y los apartados
pendientes con sus abonos (sin mover stock: el sistema anterior ya lo había descontado).
Se puede correr varias veces sin duplicar nada.
"""
from __future__ import annotations

import sqlite3
import sys
import uuid
from datetime import date, datetime, time
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
            ventas, apartados = _migrate_history(con)
        return {"productos": creados, "sin_foto": sin_foto, "con_error": con_error, "ventas": ventas,
                "apartados": apartados}
    finally:
        con.close()


if __name__ == "__main__":  # pragma: no cover
    if len(sys.argv) != 2:
        print("Uso: python -m scripts.migrar_sistema_anterior <ruta de bazarges_data.db>")
        sys.exit(1)
    from server import create_app

    print(run(create_app(), Path(sys.argv[1])))


def _rows(con: sqlite3.Connection, sql: str) -> list[sqlite3.Row]:
    try:
        return con.execute(sql).fetchall()
    except sqlite3.Error:
        return []


def _when(text: str | None) -> datetime:
    try:
        return datetime.fromisoformat(str(text)[:19]) if text and len(str(text)) > 10 else datetime.combine(
            date.fromisoformat(str(text)[:10]), time(12, 0))
    except (TypeError, ValueError):
        return datetime.now().replace(microsecond=0)


def _migrate_history(con: sqlite3.Connection) -> tuple[int, int]:
    """Ventas y apartados pendientes del sistema anterior. Ids fijos ``legacy-*`` para no duplicar."""
    from sqlalchemy import func

    from server.db import begin_write, session
    from server.models import Client, Layaway, LayawayItem, LayawayPayment, Sale, SaleItem, SalePayment, User, Variant

    begin_write()
    try:
        admin = session.query(User).filter_by(role="admin").order_by(User.id).first()
        codes = {r["id"]: (r["custom_id"] or "").strip() or f"ANT-{r['id']}" for r in _rows(con, "SELECT id, custom_id FROM products")}

        def variant(legacy_pid):
            code = codes.get(legacy_pid)
            return session.query(Variant).filter(Variant.barcode == code).first() if code else None

        def client_for(name: str):
            name = (name or "").strip()
            if not name or name.lower() in ("público general", "publico general"):
                return None
            c = session.query(Client).filter(Client.name == name, Client.notes == "Del sistema anterior").first()
            if not c:
                c = Client(id=f"legacy-c-{uuid.uuid5(uuid.NAMESPACE_URL, name).hex[:20]}", name=name[:120], notes="Del sistema anterior")
                session.add(c)
                session.flush()
            return c.id

        ventas = 0
        for r in _rows(con, "SELECT * FROM sales ORDER BY id"):
            sid = f"legacy-s-{r['id']}"
            v = variant(r["product_id"])
            if session.get(Sale, sid) or v is None:
                continue
            qty = max(1, int(r["quantity"] or 1))
            total = round(float(r["total_amount"] or 0) * 100)
            folio = (session.query(func.max(Sale.folio)).scalar() or 0) + 1
            session.add(Sale(id=sid, folio=folio, user_id=admin.id, client_id=client_for(r["customer_name"]),
                             subtotal_cents=total, discount_cents=0, total_cents=total, status="paid", source="legacy",
                             note="Del sistema anterior", created_at=_when(r["date"])))
            session.flush()
            session.add(SaleItem(sale_id=sid, variant_id=v.id, qty=qty, unit_price_cents=total // qty,
                                 unit_cost_cents=v.cost_cents, discount_cents=0))
            if total:
                session.add(SalePayment(sale_id=sid, method="cash", amount_cents=total, received_cents=total))
            ventas += 1

        apartados = 0
        for r in _rows(con, "SELECT * FROM layaways WHERE status = 'PENDIENTE' ORDER BY id"):
            lid = f"legacy-l-{r['id']}"
            v = variant(r["product_id"])
            cid = client_for(r["customer"]) or client_for("Cliente de mostrador")
            if session.get(Layaway, lid) or v is None:
                continue
            total = round(float(r["total_price"] or 0) * 100)
            pays = _rows(con, f"SELECT * FROM layaway_payments WHERE layaway_id = {int(r['id'])} ORDER BY id")
            paid = sum(round(float(p["amount"] or 0) * 100) for p in pays)
            folio = (session.query(func.max(Layaway.folio)).scalar() or 0) + 1
            session.add(Layaway(id=lid, folio=folio, client_id=cid, user_id=admin.id, subtotal_cents=total, total_cents=total,
                                paid_cents=min(paid, total), deadline=_when(r["deadline"]).date(), status="pending",
                                note="Del sistema anterior", created_at=_when(r["date_created"])))
            session.flush()
            session.add(LayawayItem(layaway_id=lid, variant_id=v.id, qty=1, unit_price_cents=total, unit_cost_cents=v.cost_cents))
            for p in pays:
                amount = round(float(p["amount"] or 0) * 100)
                if amount > 0:
                    session.add(LayawayPayment(id=f"legacy-lp-{p['id']}", layaway_id=lid, method="cash", amount_cents=amount,
                                               received_cents=amount, user_id=admin.id, created_at=_when(p["payment_date"])))
            apartados += 1
        session.commit()
        return ventas, apartados
    except Exception:
        session.rollback()
        raise
