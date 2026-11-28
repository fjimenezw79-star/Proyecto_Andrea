def test_import_test_data_twice(app, repo_root):
    from scripts.importar_datos_prueba import run

    a = run(app, repo_root / "datos_prueba")
    b = run(app, repo_root / "datos_prueba")
    assert a == {"creados": 58, "omitidos": 0, "conflictos": []}
    assert b == {"creados": 0, "omitidos": 58, "conflictos": []}


def test_imported_stock_and_price(app, admin, repo_root):
    from scripts.importar_datos_prueba import run

    run(app, repo_root / "datos_prueba")
    d = admin.get("/api/variants/lookup?code=MA000002").get_json()
    assert d["product"]["name"] == "Mario Bros" and d["variant"]["price_cents"] == 32000 and d["variant"]["stock"] == 2
    assert d["variant"]["cost_cents"] == 17600
    names = [c["name"] for c in admin.get("/api/categories").get_json()["categories"]]
    assert names == ["Mochilas", "Termos", "Cobijas", "Relojes", "Útiles"]


def test_migrate_legacy(app, admin, legacy_db):
    from scripts.migrar_sistema_anterior import run

    r = run(app, legacy_db)
    assert r["productos"] == 3 and r["ventas"] == 1 and r["apartados"] == 1
    d = admin.get("/api/variants/lookup?code=MOD001").get_json()
    assert d["product"]["name"] == "PRINCESAS DISNEY" and d["variant"]["stock"] == 3
    assert len(d["product"]["photos"]) == 2
    tree = admin.get("/api/categories").get_json()["categories"]
    assert tree[0]["name"] == "Escolar" and tree[0]["children"][0]["name"] == "Mochilas"


def test_migrate_legacy_twice_is_safe(app, legacy_db):
    from scripts.migrar_sistema_anterior import run

    run(app, legacy_db)
    assert run(app, legacy_db)["productos"] == 0


def test_migrate_legacy_sales_and_layaways(app, admin, legacy_db):
    from scripts.migrar_sistema_anterior import run

    run(app, legacy_db)
    sales = admin.get("/api/sales?date=2025-12-03").get_json()["sales"]
    assert len(sales) == 1 and sales[0]["total_cents"] == 34000 and sales[0]["source"] == "legacy"
    assert sales[0]["items"][0]["name"] == "PRINCESAS DISNEY"
    lay = admin.get("/api/layaways?status=pending").get_json()["layaways"]
    assert len(lay) == 1
    l = lay[0]
    assert l["client_name"] == "FRANCISCO WITRAGO" and l["total_cents"] == 32000 and l["paid_cents"] == 16000
    assert len(l["payments"]) == 5 and l["deadline"] == "2025-12-30" and l["items"][0]["name"] == "MARIO BROS"
    assert admin.get("/api/variants/lookup?code=MOD002").get_json()["variant"]["stock"] == 2


def test_migrate_twice_no_duplicates(app, admin, legacy_db):
    from scripts.migrar_sistema_anterior import run

    run(app, legacy_db)
    r = run(app, legacy_db)
    assert r["ventas"] == 0 and r["apartados"] == 0
    assert len(admin.get("/api/sales?date=2025-12-03").get_json()["sales"]) == 1
    assert len(admin.get("/api/layaways").get_json()["layaways"]) == 1
    assert len(admin.get("/api/clients?q=FRANCISCO").get_json()["clients"]) == 1
