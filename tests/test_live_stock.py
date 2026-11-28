def test_changes_since_returns_only_moved_variants(admin, v1, v2):
    client = admin
    full = client.get("/api/stock/changes").get_json()
    assert full["full"] is True and isinstance(full["version"], int)
    since = full["version"]
    assert client.get(f"/api/stock/changes?since={since}").get_json()["changes"] == []
    r = client.post("/api/inventory/entries", json={"items": [{"variant_id": v1, "qty": 2}], "note": "llegó"})
    assert r.status_code in (200, 201), r.get_json()
    d = client.get(f"/api/stock/changes?since={since}").get_json()
    assert d["version"] > since and "full" not in d
    assert d["changes"] == [{"variant_id": v1, "stock": 5}]


def test_changes_old_since_asks_for_full_reload(admin, v1):
    client = admin
    v = client.get("/api/stock/changes").get_json()["version"]
    assert client.get("/api/stock/changes?since=abc").get_json()["full"] is True
    assert client.get(f"/api/stock/changes?since={v + 999}").get_json()["full"] is True


def test_changes_requires_login(client):
    assert client.get("/api/stock/changes").status_code == 401


def test_snapshot_has_all_products_without_cost(admin, v1, v2):
    d = admin.get("/api/catalog/snapshot").get_json()
    assert isinstance(d["version"], int) and d["categories"]
    names = {p["name"] for p in d["products"]}
    assert len(names) >= 1
    assert all("cost_cents" not in v for p in d["products"] for v in p["variants"])
