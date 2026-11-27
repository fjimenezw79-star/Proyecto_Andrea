def test_default_settings(seller):
    s = seller.get("/api/settings").get_json()["settings"]
    assert s["business_name"] == "Modas Andrea" and s["business_subtitle"] == "Yuda"


def test_seller_cannot_change_settings(seller):
    assert seller.put("/api/settings", json={"whatsapp": "4731234567"}).status_code == 403


def test_admin_changes_settings_and_unknown_key_rejected(admin):
    assert admin.put("/api/settings", json={"whatsapp": "4731234567"}).status_code == 200
    assert admin.get("/api/settings").get_json()["settings"]["whatsapp"] == "4731234567"
    assert admin.put("/api/settings", json={"color_favorito": "azul"}).status_code == 400


def test_category_tree_and_slug(admin):
    hogar = admin.post("/api/categories", json={"name": "Hogar"}).get_json()["category"]
    admin.post("/api/categories", json={"name": "Termos", "parent_id": hogar["id"]})
    u = admin.post("/api/categories", json={"name": "Útiles"}).get_json()["category"]
    assert u["slug"] == "utiles"
    tree = admin.get("/api/categories").get_json()["categories"]
    assert [c["name"] for c in tree] == ["Hogar", "Útiles"]
    assert tree[0]["children"][0]["name"] == "Termos"


def test_repeated_name_gets_unique_slug(admin):
    a = admin.post("/api/categories", json={"name": "Termos"}).get_json()["category"]
    b = admin.post("/api/categories", json={"name": "Termos", "parent_id": a["id"]}).get_json()["category"]
    assert b["slug"] == "termos-2"


def test_category_cycle_rejected(admin):
    a = admin.post("/api/categories", json={"name": "A"}).get_json()["category"]
    b = admin.post("/api/categories", json={"name": "B", "parent_id": a["id"]}).get_json()["category"]
    r = admin.patch(f"/api/categories/{a['id']}", json={"parent_id": b["id"]})
    assert r.status_code == 400


def test_seller_cannot_create_category(seller):
    assert seller.post("/api/categories", json={"name": "X"}).status_code == 403
