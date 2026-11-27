"""Pruebas de los hallazgos de la revisión final de la etapa 1."""
import shutil
import sqlite3

from tests.conftest import post_product


def test_reads_do_not_hold_write_lock(app, admin):
    """Una lectura no debe apartar la base en modo escritura (I-1)."""
    from server.db import session
    from server.models import Setting

    with app.app_context():
        session.query(Setting).all()  # deja abierta una transacción de solo lectura
        other = sqlite3.connect(app.config["DATABASE"], timeout=0.2, isolation_level=None)
        try:
            other.execute("BEGIN IMMEDIATE")
            other.execute("ROLLBACK")
        finally:
            other.close()


def test_legacy_without_code_not_duplicated(app, legacy_db, tmp_path):
    """Correr la migración dos veces no duplica productos sin código (I-2)."""
    from scripts.migrar_sistema_anterior import run

    folder = tmp_path / "legacy"
    shutil.copytree(legacy_db.parent, folder)
    con = sqlite3.connect(folder / "bazarges_data.db")
    con.execute("UPDATE products SET custom_id = NULL WHERE id = 3")
    con.commit()
    con.close()
    assert run(app, folder / "bazarges_data.db")["productos"] == 3
    assert run(app, folder / "bazarges_data.db")["productos"] == 0


def test_fractional_money_and_qty_rejected(admin, cat_id, jpeg, v1):
    r = post_product(admin, {"name": "X", "category_id": cat_id, "price_cents": 199.99, "cost_cents": 0},
                     [(jpeg(), "a.jpg")])
    assert r.status_code == 400 and r.get_json()["field"] == "price_cents"
    r = admin.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1.9}],
                                       "payments": [{"method": "card", "amount_cents": 35000}]})
    assert r.status_code == 400
    r = admin.post("/api/sales", json={"items": [{"variant_id": v1, "qty": True}],
                                       "payments": [{"method": "card", "amount_cents": 35000}]})
    assert r.status_code == 400


def test_internal_code_pattern_rejected_as_barcode(admin, product):
    r = admin.patch(f"/api/variants/{product['variants'][0]['id']}", json={"barcode": "ma000005"})
    assert r.status_code == 400


def test_barcode_uniqueness_ignores_case(admin, product, product2):
    admin.patch(f"/api/variants/{product['variants'][0]['id']}", json={"barcode": "abc1"})
    r = admin.patch(f"/api/variants/{product2['variants'][0]['id']}", json={"barcode": "ABC1"})
    assert r.status_code == 409
    assert admin.get("/api/variants/lookup?code=ABC1").get_json()["product"]["id"] == product["id"]
