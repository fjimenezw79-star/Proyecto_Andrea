import threading


def test_sale_two_items_cash_change(seller, v1, v2):   # v1: $350, stock 3 ; v2: $190, stock 4
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}, {"variant_id": v2, "qty": 2}],
                                        "payments": [{"method": "cash", "amount_cents": 73000, "received_cents": 100000}]})
    assert r.status_code == 201
    s = r.get_json()["sale"]
    assert s["total_cents"] == 73000 and s["change_cents"] == 27000 and s["folio"] == 1


def test_mixed_payment_must_match(seller, v1):
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}],
                                        "payments": [{"method": "card", "amount_cents": 20000},
                                                     {"method": "cash", "amount_cents": 10000, "received_cents": 10000}]})
    assert r.status_code == 400 and r.get_json()["message"] == "Los pagos no cuadran con el total."


def test_cash_received_less_than_amount(seller, v1):
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}],
                                        "payments": [{"method": "cash", "amount_cents": 35000, "received_cents": 30000}]})
    assert r.status_code == 400


def test_insufficient_stock_409_and_nothing_changes(seller, admin, v1):
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 4}],
                                        "payments": [{"method": "cash", "amount_cents": 140000, "received_cents": 140000}]})
    assert r.status_code == 409 and "Quedan 3" in r.get_json()["message"]
    assert admin.get("/api/sales").get_json()["sales"] == []


def test_seller_discount_cap(seller, v1):
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}], "discount_cents": 3600,
                                        "payments": [{"method": "card", "amount_cents": 31400}]})
    assert r.status_code == 403
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}], "discount_cents": 3500,
                                        "payments": [{"method": "card", "amount_cents": 31500}]})
    assert r.status_code == 201


def test_cost_snapshot(admin, seller, v1):
    sid = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}],
                                          "payments": [{"method": "transfer", "amount_cents": 35000}]}).get_json()["sale"]["id"]
    admin.patch(f"/api/variants/{v1}", json={"cost_cents": 99900})
    assert admin.get(f"/api/sales/{sid}").get_json()["sale"]["items"][0]["unit_cost_cents"] == 20000


def test_same_id_not_duplicated(seller, v1):
    body = {"id": "3f1c2a1e-0000-4000-8000-000000000001", "items": [{"variant_id": v1, "qty": 1}],
            "payments": [{"method": "card", "amount_cents": 35000}]}
    a = seller.post("/api/sales", json=body).get_json()["sale"]
    b = seller.post("/api/sales", json=body).get_json()["sale"]
    assert a["folio"] == b["folio"]
    assert seller.get(f"/api/variants/lookup?code=MA000001").get_json()["variant"]["stock"] == 2


def test_cancel_returns_stock_once(admin, seller, v1):
    sid = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 2}],
                                          "payments": [{"method": "card", "amount_cents": 70000}]}).get_json()["sale"]["id"]
    assert seller.post(f"/api/sales/{sid}/cancel", json={"reason": "x"}).status_code == 403
    assert admin.post(f"/api/sales/{sid}/cancel", json={"reason": "Cliente devolvió"}).status_code == 200
    assert admin.post(f"/api/sales/{sid}/cancel", json={"reason": "otra vez"}).status_code == 409
    assert admin.get("/api/variants/lookup?code=MA000001").get_json()["variant"]["stock"] == 3


def test_points_added_to_client(app, seller, v1):
    from server.db import session
    from server.models import Client

    with app.app_context():
        session.add(Client(id="c-1", name="Laura")); session.commit()
    seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}], "client_id": "c-1",
                                    "payments": [{"method": "card", "amount_cents": 35000}]})
    with app.app_context():
        assert session.get(Client, "c-1").points == 35


def test_last_piece_concurrent(app, v_one_left, seller_user):
    """Dos ventas simultáneas de la última pieza: solo una pasa."""
    from server.services.sales import create_sale

    results = []
    barrier = threading.Barrier(2)

    def go():
        with app.app_context():
            barrier.wait()
            try:
                create_sale({"items": [{"variant_id": v_one_left, "qty": 1}],
                             "payments": [{"method": "card", "amount_cents": 35000}]}, seller_user)
                results.append("ok")
            except Exception as e:  # noqa: BLE001
                results.append(type(e).__name__)

    ts = [threading.Thread(target=go) for _ in range(2)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert sorted(results) == ["InsufficientStock", "ok"]


def test_sale_has_user_and_client_names(app, seller, v1):
    from server.db import session
    from server.models import Client

    s = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}],
                                        "payments": [{"method": "card", "amount_cents": 35000}]}).get_json()["sale"]
    assert s["user_name"] == "Vendedor" and s["client_name"] is None
    with app.app_context():
        session.add(Client(id="c-9", name="Laura Pérez"))
        session.commit()
    s = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 1}], "client_id": "c-9",
                                        "payments": [{"method": "card", "amount_cents": 35000}]}).get_json()["sale"]
    assert s["client_name"] == "Laura Pérez"


def test_409_reports_available(seller, v1):
    r = seller.post("/api/sales", json={"items": [{"variant_id": v1, "qty": 9}],
                                        "payments": [{"method": "card", "amount_cents": 315000}]})
    assert r.status_code == 409 and r.get_json()["available"] == 3 and r.get_json()["variant_id"] == v1
