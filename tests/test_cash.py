def summary(c):
    return c.get("/api/cash/current").get_json()["summary"]


def sell(c, vid, total, method="cash", received=None):
    p = {"method": method, "amount_cents": total}
    if method == "cash":
        p["received_cents"] = received or total
    r = c.post("/api/sales", json={"items": [{"variant_id": vid, "qty": 1}], "payments": [p]})
    assert r.status_code == 201, r.get_json()
    return r.get_json()["sale"]


def test_open_and_only_one(seller):
    assert seller.post("/api/cash/open", json={"opening_cents": 50000}).status_code == 201
    assert seller.post("/api/cash/open", json={"opening_cents": 1}).status_code == 409


def test_cash_sale_counts_amount_not_received(seller, v1):
    seller.post("/api/cash/open", json={"opening_cents": 50000})
    sell(seller, v1, 35000, received=50000)
    s = summary(seller)
    assert s["cash_sales_cents"] == 35000 and s["expected_cents"] == 85000


def test_card_does_not_change_expected(seller, v1):
    seller.post("/api/cash/open", json={"opening_cents": 50000})
    sell(seller, v1, 35000, method="card")
    s = summary(seller)
    assert s["expected_cents"] == 50000 and s["card_cents"] == 35000


def test_refund_and_register_expense_subtract(admin, v1):
    admin.post("/api/cash/open", json={"opening_cents": 50000})
    sale = sell(admin, v1, 35000)
    iid = admin.get(f"/api/sales/{sale['id']}").get_json()["sale"]["items"][0]["id"]
    admin.post(f"/api/sales/{sale['id']}/returns", json={"items": [{"sale_item_id": iid, "qty": 1}],
                                                         "refund_method": "cash", "reason": "x"})
    admin.post("/api/expenses", json={"description": "Garrafón", "category": "Insumos", "amount_cents": 5000,
                                      "from_register": True})
    s = summary(admin)
    assert s["refunds_cash_cents"] == 35000 and s["expenses_cash_cents"] == 5000 and s["expected_cents"] == 45000
    kinds = [m["kind"] for m in s["movements"]]
    assert kinds.count("Venta") == 1 and "Devolución" in kinds and "Gasto" in kinds


def test_layaway_cash_payments_and_cancel_refund(admin, seller, v1, client_id):
    seller.post("/api/cash/open", json={"opening_cents": 0})
    l = seller.post("/api/layaways", json={"client_id": client_id, "items": [{"variant_id": v1, "qty": 1}],
                                          "payments": [{"method": "cash", "amount_cents": 10000, "received_cents": 20000}]}).get_json()["layaway"]
    assert summary(seller)["layaway_cash_cents"] == 10000
    admin.post(f"/api/layaways/{l['id']}/cancel", json={"reason": "x", "refund_mode": "refund", "refund_method": "cash"})
    s = summary(seller)
    assert s["refunds_cash_cents"] == 10000 and s["expected_cents"] == 0


def test_close_records_difference(seller, v1):
    seller.post("/api/cash/open", json={"opening_cents": 50000})
    sell(seller, v1, 35000)
    r = seller.post("/api/cash/close", json={"counted_cents": 84000, "notes": "Faltó un billete"})
    assert r.status_code == 200
    s = r.get_json()["session"]
    assert s["expected_cents"] == 85000 and s["difference_cents"] == -1000
    assert seller.get("/api/cash/current").get_json()["session"] is None
    assert seller.post("/api/cash/close", json={"counted_cents": 0}).status_code == 409


def test_history_admin_only(admin, seller):
    seller.post("/api/cash/open", json={"opening_cents": 100})
    seller.post("/api/cash/close", json={"counted_cents": 100})
    assert seller.get("/api/cash/sessions").status_code == 403
    assert len(admin.get("/api/cash/sessions").get_json()["sessions"]) == 1
