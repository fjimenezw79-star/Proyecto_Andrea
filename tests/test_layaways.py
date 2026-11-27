from datetime import date, timedelta


def create(c, variant, client, deposit=10000, method="card", qty=1, **extra):
    pays = [{"method": method, "amount_cents": deposit, **({"received_cents": deposit} if method == "cash" else {})}] if deposit else []
    return c.post("/api/layaways", json={"client_id": client, "items": [{"variant_id": variant, "qty": qty}],
                                         "payments": pays, **extra})


def stock(c, vid):
    for p in c.get("/api/products").get_json()["products"]:
        for v in p["variants"]:
            if v["id"] == vid:
                return v["stock"]


def test_create_reserves_stock(seller, v1, client_id):          # v1 stock 3, $350
    r = create(seller, v1, client_id)
    assert r.status_code == 201
    l = r.get_json()["layaway"]
    assert l["balance_cents"] == 25000 and l["folio"] == 1 and l["status"] == "pending"
    assert l["deadline"] == (date.today() + timedelta(days=30)).isoformat()
    assert stock(seller, v1) == 2


def test_deposit_required_and_client_required(seller, v1, client_id):
    r = create(seller, v1, client_id, deposit=0)
    assert r.status_code == 400 and r.get_json()["message"] == "El apartado necesita un anticipo."
    r = seller.post("/api/layaways", json={"items": [{"variant_id": v1, "qty": 1}],
                                           "payments": [{"method": "card", "amount_cents": 100}]})
    assert r.status_code == 400 and r.get_json()["field"] == "client_id"


def test_not_enough_stock(seller, v1, client_id):
    r = create(seller, v1, client_id, qty=4)
    assert r.status_code == 409 and "Quedan 3" in r.get_json()["message"]


def test_payment_over_balance_rejected(seller, v1, client_id):
    lid = create(seller, v1, client_id).get_json()["layaway"]["id"]
    r = seller.post(f"/api/layaways/{lid}/payments", json={"payments": [{"method": "card", "amount_cents": 30000}]})
    assert r.status_code == 400 and r.get_json()["message"] == "El abono es mayor que el saldo. Faltan $250.00."


def test_payment_idempotent(seller, v1, client_id):
    lid = create(seller, v1, client_id).get_json()["layaway"]["id"]
    body = {"id": "ab-0000-0000-0001", "payments": [{"method": "card", "amount_cents": 5000}]}
    seller.post(f"/api/layaways/{lid}/payments", json=body)
    r = seller.post(f"/api/layaways/{lid}/payments", json=body)
    assert r.get_json()["layaway"]["paid_cents"] == 15000 and len(r.get_json()["layaway"]["payments"]) == 2


def test_settle_requires_full_payment(seller, v1, client_id):
    lid = create(seller, v1, client_id).get_json()["layaway"]["id"]
    r = seller.post(f"/api/layaways/{lid}/settle", json={})
    assert r.status_code == 400 and r.get_json()["message"] == "Faltan $250.00 para liquidar."


def test_settle_creates_sale_without_moving_stock(seller, v1, client_id):
    lid = create(seller, v1, client_id).get_json()["layaway"]["id"]
    r = seller.post(f"/api/layaways/{lid}/settle", json={"payments": [{"method": "transfer", "amount_cents": 25000}]})
    assert r.status_code == 200
    sale = r.get_json()["sale"]
    assert sale["total_cents"] == 35000 and r.get_json()["layaway"]["status"] == "settled"
    assert stock(seller, v1) == 2
    assert seller.get(f"/api/clients/{client_id}").get_json()["client"]["points"] == 35
    assert seller.post(f"/api/layaways/{lid}/settle", json={}).status_code == 409


def test_cancel_refund_returns_stock_once_and_keeps_payments(admin, seller, v1, client_id):
    lid = create(seller, v1, client_id).get_json()["layaway"]["id"]
    r = admin.post(f"/api/layaways/{lid}/cancel", json={"reason": "Ya no lo quiere", "refund_mode": "refund",
                                                         "refund_method": "cash"})
    assert r.status_code == 200 and r.get_json()["layaway"]["status"] == "cancelled"
    assert stock(admin, v1) == 3 and len(r.get_json()["layaway"]["payments"]) == 1
    assert admin.post(f"/api/layaways/{lid}/cancel", json={"reason": "x", "refund_mode": "refund",
                                                            "refund_method": "cash"}).status_code == 409
    assert stock(admin, v1) == 3


def test_cancel_as_credit(admin, seller, v1, client_id):
    lid = create(seller, v1, client_id).get_json()["layaway"]["id"]
    admin.post(f"/api/layaways/{lid}/cancel", json={"reason": "Cambio de idea", "refund_mode": "credit"})
    assert admin.get(f"/api/clients/{client_id}").get_json()["client"]["credit_cents"] == 10000


def test_cancel_requires_reason(admin, seller, v1, client_id):
    lid = create(seller, v1, client_id).get_json()["layaway"]["id"]
    assert admin.post(f"/api/layaways/{lid}/cancel", json={"refund_mode": "credit"}).status_code == 400


def test_seller_cannot_cancel(seller, v1, client_id):
    lid = create(seller, v1, client_id).get_json()["layaway"]["id"]
    assert seller.post(f"/api/layaways/{lid}/cancel", json={"reason": "x", "refund_mode": "credit"}).status_code == 403


def test_overdue_filter(seller, v1, client_id):
    create(seller, v1, client_id, deadline=(date.today() - timedelta(days=1)).isoformat())
    create(seller, v1, client_id)
    assert len(seller.get("/api/layaways?status=overdue").get_json()["layaways"]) == 1
    assert len(seller.get("/api/layaways?status=pending").get_json()["layaways"]) == 2


def test_layaway_with_credit_deposit(seller, v1, client_with_credit):
    r = create(seller, v1, client_with_credit, deposit=10000, method="credit")
    assert r.status_code == 201
    assert seller.get(f"/api/clients/{client_with_credit}").get_json()["client"]["credit_cents"] == 0
