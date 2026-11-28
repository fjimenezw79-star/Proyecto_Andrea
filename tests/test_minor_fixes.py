"""Pendientes menores de la revisión final de la etapa 1."""
import shutil
import sqlite3

import pytest

from tests.conftest import post_product


def test_bad_category_id_is_400(admin, jpeg):
    r = post_product(admin, {"name": "X", "category_id": "abc", "price_cents": 1}, [(jpeg(), "a.jpg")])
    assert r.status_code == 400 and r.get_json()["field"] == "category_id"
    assert admin.post("/api/categories", json={"name": "Y", "parent_id": "abc"}).status_code == 400


def test_product_data_must_be_object(admin, jpeg):
    r = admin.post("/api/products", data={"data": "[1, 2]", "photos": [(jpeg(), "a.jpg")]},
                   content_type="multipart/form-data")
    assert r.status_code == 400


def test_update_product_bad_category_is_400(admin, product):
    assert admin.patch(f"/api/products/{product['id']}", json={"category_id": "abc"}).status_code == 400


def test_full_discount_sale_without_payments(admin, v1):
    r = admin.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}], "discount_cents": 35000,
                                       "payments": []})
    assert r.status_code == 201 and r.get_json()["sale"]["total_cents"] == 0


def test_internal_keyerror_is_not_404(app, admin, monkeypatch):
    from server.services import sales

    def boom(_sale_id):
        raise KeyError("x")

    monkeypatch.setattr(sales, "get_sale", boom)
    app.config["PROPAGATE_EXCEPTIONS"] = False
    assert admin.get("/api/sales/abc").status_code == 500


def test_missing_sale_is_404(admin):
    r = admin.get("/api/sales/no-existe-123")
    assert r.status_code == 404 and r.get_json()["message"] == "La venta no existe."


def test_import_is_atomic_per_product(app, repo_root, monkeypatch):
    import scripts.importar_datos_prueba as imp
    from server.services import inventory

    calls = {"n": 0}
    real = inventory.move

    def flaky(*a, **k):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("se fue la luz")
        return real(*a, **k)

    monkeypatch.setattr(inventory, "move", flaky)
    with pytest.raises(RuntimeError):
        imp.run(app, repo_root / "datos_prueba")
    monkeypatch.setattr(inventory, "move", real)
    assert imp.run(app, repo_root / "datos_prueba") == {"creados": 57, "omitidos": 1, "conflictos": []}
    from server.db import session
    from server.models import Variant

    with app.app_context():
        assert session.query(Variant).filter_by(sku="MA000002").one().stock == 2


def test_import_reports_sku_owned_by_other_product(app, admin, cat_id, jpeg, repo_root):
    post_product(admin, {"name": "Mi producto", "category_id": cat_id, "price_cents": 100}, [(jpeg(), "a.jpg")])
    from scripts.importar_datos_prueba import run

    r = run(app, repo_root / "datos_prueba")
    assert r["conflictos"] == ["MA000001"] and r["creados"] == 57


def test_legacy_bad_code_does_not_abort(app, legacy_db, tmp_path):
    from scripts.migrar_sistema_anterior import run

    folder = tmp_path / "legacy"
    shutil.copytree(legacy_db.parent, folder)
    con = sqlite3.connect(folder / "bazarges_data.db")
    con.execute("UPDATE products SET custom_id = 'MOD 001/A' WHERE id = 1")
    con.commit()
    con.close()
    r = run(app, folder / "bazarges_data.db")
    assert r["productos"] == 2 and r["con_error"] == ["PRINCESAS DISNEY"]


@pytest.mark.parametrize("key,value", [("low_stock_threshold", -5), ("ticket_width_mm", 7), ("ticket_width_mm", 500)])
def test_settings_ranges(admin, key, value):
    assert admin.put("/api/settings", json={key: value}).status_code == 400


def test_413_message_mentions_whole_upload(app, admin):
    app.config["MAX_CONTENT_LENGTH"] = 10
    r = admin.post("/api/products", data={"data": "{}" * 50}, content_type="multipart/form-data")
    assert r.status_code == 413 and "en total" in r.get_json()["message"]


def test_configurar_keeps_existing_env_values(tmp_path, repo_root):
    from scripts.configurar import run

    (tmp_path / ".env.example").write_text((repo_root / ".env.example").read_text(encoding="utf-8"), encoding="utf-8")
    (tmp_path / ".env").write_text("PORT=5010\n", encoding="utf-8")
    assert run(tmp_path) is True
    text = (tmp_path / ".env").read_text(encoding="utf-8")
    assert "PORT=5010" in text and len(text.split("SECRET_KEY=")[1].split()[0]) == 64


def test_old_login_failures_are_cleaned(app, client):
    from datetime import datetime, timedelta

    from server.db import session
    from server.models import LoginFailure

    with app.app_context():
        session.add(LoginFailure(username="fantasma", at=datetime.now() - timedelta(days=2)))
        session.commit()
    client.post("/api/auth/login", json={"username": "admin", "password": "x"})
    with app.app_context():
        assert session.query(LoginFailure).filter_by(username="fantasma").count() == 0


def test_lookup_inactive_variant_is_404(admin, product):
    vid = product["variants"][0]["id"]
    admin.patch(f"/api/variants/{vid}", json={"active": False})
    r = admin.get(f"/api/variants/lookup?code={product['variants'][0]['sku']}")
    assert r.status_code == 404 and r.get_json()["message"] == "Ese producto está dado de baja."


def test_configurar_adds_new_options_to_an_old_env(tmp_path, repo_root):
    """Al actualizar se copia el .env anterior: se conservan sus valores y se agregan las opciones nuevas."""
    from scripts.configurar import run

    (tmp_path / ".env.example").write_text((repo_root / ".env.example").read_text(encoding="utf-8"), encoding="utf-8")
    old = "SECRET_KEY=" + "a" * 64 + "\nPORT=5010\nCLOUDFLARE_TUNNEL_TOKEN=tok-viejo\n"
    (tmp_path / ".env").write_text(old, encoding="utf-8")
    assert run(tmp_path) is True
    text = (tmp_path / ".env").read_text(encoding="utf-8")
    assert text.startswith(old)  # nada de lo anterior cambia
    assert "\nANTHROPIC_API_KEY=\n" in text and "\nCLOUDFLARE_PAGES_PROJECT=modas-andrea-tienda\n" in text
    assert "# Clave de la API de Anthropic" in text  # con su explicación
    assert text.count("CLOUDFLARE_TUNNEL_TOKEN=") == 1 and text.count("SECRET_KEY=") == 1
    assert run(tmp_path) is False  # la segunda vez ya no hay nada que agregar
