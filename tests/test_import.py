def test_import_test_data_twice(app, repo_root):
    from scripts.importar_datos_prueba import run

    a = run(app, repo_root / "datos_prueba")
    b = run(app, repo_root / "datos_prueba")
    assert a == {"creados": 58, "omitidos": 0} and b == {"creados": 0, "omitidos": 58}


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
    assert r["productos"] == 3 and r["ventas_omitidas"] == 1 and r["apartados_omitidos"] == 1
    d = admin.get("/api/variants/lookup?code=MOD001").get_json()
    assert d["product"]["name"] == "PRINCESAS DISNEY" and d["variant"]["stock"] == 3
    assert len(d["product"]["photos"]) == 2
    tree = admin.get("/api/categories").get_json()["categories"]
    assert tree[0]["name"] == "Escolar" and tree[0]["children"][0]["name"] == "Mochilas"


def test_migrate_legacy_twice_is_safe(app, legacy_db):
    from scripts.migrar_sistema_anterior import run

    run(app, legacy_db)
    assert run(app, legacy_db)["productos"] == 0
