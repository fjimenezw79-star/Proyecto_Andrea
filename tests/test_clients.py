import threading


def test_create_and_search(seller):
    c = seller.post("/api/clients", json={"name": "Laura Pérez", "phone": "4731234567"}).get_json()["client"]
    assert c["points"] == 0 and c["credit_cents"] == 0
    assert seller.get("/api/clients?q=4731").get_json()["clients"][0]["id"] == c["id"]
    assert seller.get("/api/clients?q=laura").get_json()["clients"][0]["id"] == c["id"]


def test_duplicate_phone(seller):
    seller.post("/api/clients", json={"name": "A", "phone": "4731234567"})
    r = seller.post("/api/clients", json={"name": "B", "phone": "473 123 4567"})
    assert r.status_code == 409 and r.get_json()["message"] == "Ya existe un cliente con ese teléfono: A."


def test_bad_phone_and_missing_name(seller):
    assert seller.post("/api/clients", json={"name": "A", "phone": "123"}).status_code == 400
    assert seller.post("/api/clients", json={"name": " "}).status_code == 400


def test_client_id_from_device(seller):
    cid = "7c9e6679-7425-40de-944b-e07fc1f90ae7"
    assert seller.post("/api/clients", json={"id": cid, "name": "Ana"}).get_json()["client"]["id"] == cid
    assert seller.post("/api/clients", json={"id": cid, "name": "Ana"}).status_code in (200, 201)


def test_update_and_detail(seller, client_id, v1):
    seller.patch(f"/api/clients/{client_id}", json={"notes": "Prefiere WhatsApp"})
    seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}], "client_id": client_id,
                                    "payments": [{"method": "card", "amount_cents": 35000}]})
    d = seller.get(f"/api/clients/{client_id}").get_json()
    assert d["client"]["notes"] == "Prefiere WhatsApp" and d["client"]["points"] == 35
    assert len(d["sales"]) == 1 and d["total_spent_cents"] == 35000


def test_pay_with_credit(seller, v1, client_with_credit):
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}], "client_id": client_with_credit,
                                        "payments": [{"method": "credit", "amount_cents": 10000},
                                                     {"method": "card", "amount_cents": 25000}]})
    assert r.status_code == 201
    assert seller.get(f"/api/clients/{client_with_credit}").get_json()["client"]["credit_cents"] == 0


def test_credit_needs_client_and_balance(seller, v1, client_with_credit):
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}],
                                        "payments": [{"method": "credit", "amount_cents": 35000}]})
    assert r.status_code == 400 and r.get_json()["message"] == "Elige al cliente para usar su saldo a favor."
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}], "client_id": client_with_credit,
                                        "payments": [{"method": "credit", "amount_cents": 35000}]})
    assert r.status_code == 400 and r.get_json()["message"] == "El saldo a favor del cliente es de $100.00."


def test_credit_not_spent_twice_concurrently(app, client_with_credit, v1, seller_user):
    from server.services.sales import create_sale

    results, barrier = [], threading.Barrier(2)

    def go():
        with app.app_context():
            barrier.wait()
            try:
                create_sale({"items": [{"variant_id": v1, "qty": 1}], "client_id": client_with_credit,
                             "payments": [{"method": "credit", "amount_cents": 10000},
                                          {"method": "card", "amount_cents": 25000}]}, seller_user)
                results.append("ok")
            except Exception as e:  # noqa: BLE001
                results.append(type(e).__name__)

    ts = [threading.Thread(target=go) for _ in range(2)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert sorted(results) == ["ValidationError", "ok"]


def test_cash_without_session_auto_opens(app, seller, v1):
    seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}],
                                    "payments": [{"method": "cash", "amount_cents": 35000, "received_cents": 50000}]})
    from server.db import session
    from server.models import CashSession, SalePayment

    with app.app_context():
        cs = session.query(CashSession).one()
        assert cs.auto is True and cs.opening_cents == 0 and cs.closed_at is None
        assert session.query(SalePayment).one().cash_session_id == cs.id
