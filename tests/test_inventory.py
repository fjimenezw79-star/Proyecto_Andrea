import pytest


def test_entry_increases_stock_and_logs(admin, product):
    v = product["variants"][0]["id"]
    admin.post("/api/inventory/entries", json={"items": [{"variant_id": v, "qty": 5}], "note": "Compra"})
    mv = admin.get(f"/api/inventory/movements?variant_id={v}").get_json()["movements"]
    assert mv[0]["qty_delta"] == 5 and mv[0]["reason"] == "purchase"
    assert admin.get(f"/api/products/{product['id']}").get_json()["product"]["variants"][0]["stock"] == 5


def test_entry_updates_cost(admin, product):
    v = product["variants"][0]["id"]
    admin.post("/api/inventory/entries", json={"items": [{"variant_id": v, "qty": 1, "cost_cents": 21000}]})
    assert admin.get(f"/api/products/{product['id']}").get_json()["product"]["variants"][0]["cost_cents"] == 21000


def test_entry_rejects_zero_or_negative(admin, product):
    v = product["variants"][0]["id"]
    assert admin.post("/api/inventory/entries", json={"items": [{"variant_id": v, "qty": 0}]}).status_code == 400
    assert admin.post("/api/inventory/entries", json={"items": [{"variant_id": v, "qty": -2}]}).status_code == 400


def test_adjustment_requires_note_and_sets_exact_stock(admin, stocked_variant):
    r = admin.post("/api/inventory/adjustments", json={"variant_id": stocked_variant, "new_stock": 2})
    assert r.status_code == 400
    admin.post("/api/inventory/adjustments", json={"variant_id": stocked_variant, "new_stock": 2, "note": "Conteo"})
    mv = admin.get(f"/api/inventory/movements?variant_id={stocked_variant}").get_json()["movements"][0]
    assert mv["qty_delta"] == -3 and mv["reason"] == "adjustment"


def test_low_stock(admin, stocked_variant):
    admin.post("/api/inventory/adjustments", json={"variant_id": stocked_variant, "new_stock": 2, "note": "x"})
    ids = [v["id"] for v in admin.get("/api/inventory/low-stock").get_json()["variants"]]
    assert stocked_variant in ids


def test_move_never_negative(app, stocked_variant):
    from server.services.inventory import InsufficientStock, move

    with app.app_context(), pytest.raises(InsufficientStock):
        move(stocked_variant, -6, "adjustment", None)


def test_seller_cannot_enter_stock(seller, product):
    v = product["variants"][0]["id"]
    assert seller.post("/api/inventory/entries", json={"items": [{"variant_id": v, "qty": 1}]}).status_code == 403
