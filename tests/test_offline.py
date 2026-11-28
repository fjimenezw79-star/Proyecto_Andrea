from datetime import datetime, timedelta


def hdr(uid, when=None, offline=True):
    h = {"X-Client-Uid": uid}
    if when:
        h["X-Client-Time"] = when.isoformat(timespec="seconds")
    if offline:
        h["X-Offline"] = "1"
    return h


def sale_body(vid, sid, qty=1, total=35000):
    return {"id": sid, "items": [{"variant_id": vid, "qty": qty}], "payments": [{"method": "card", "amount_cents": total}]}


def test_same_uid_replays_same_sale(seller, v1):
    body = sale_body(v1, "11111111-0000-4000-8000-000000000001")
    a = seller.post("/api/sales", json=body, headers=hdr("op-aaaaaaaaaaaa"))
    b = seller.post("/api/sales", json=body, headers=hdr("op-aaaaaaaaaaaa"))
    assert a.status_code == b.status_code == 201
    assert b.headers.get("X-Replayed") == "1" and a.get_json()["sale"]["folio"] == b.get_json()["sale"]["folio"]
    assert len(seller.get("/api/sales").get_json()["sales"]) == 1


def test_client_time_used_when_recent(seller, v1):
    when = (datetime.now() - timedelta(hours=3)).replace(microsecond=0)
    s = seller.post("/api/sales", json=sale_body(v1, "11111111-0000-4000-8000-000000000002"),
                    headers=hdr("op-bbbbbbbbbbbb", when)).get_json()["sale"]
    assert s["created_at"] == when.isoformat()


def test_client_time_ignored_when_older_than_7_days_or_future(seller, v1):
    old = datetime.now() - timedelta(days=8)
    s = seller.post("/api/sales", json=sale_body(v1, "11111111-0000-4000-8000-000000000003"),
                    headers=hdr("op-cccccccccccc", old)).get_json()["sale"]
    assert datetime.fromisoformat(s["created_at"]) > datetime.now() - timedelta(minutes=1)
    fut = datetime.now() + timedelta(hours=2)
    s = seller.post("/api/sales", json=sale_body(v1, "11111111-0000-4000-8000-000000000004"),
                    headers=hdr("op-dddddddddddd", fut)).get_json()["sale"]
    assert datetime.fromisoformat(s["created_at"]) < datetime.now() + timedelta(minutes=1)


def test_offline_sale_last_piece_goes_negative_and_alerts(admin, seller, v_one_left):
    seller.post("/api/sales", json=sale_body(v_one_left, "11111111-0000-4000-8000-000000000005"))
    r = seller.post("/api/sales", json=sale_body(v_one_left, "11111111-0000-4000-8000-000000000006"),
                    headers=hdr("op-eeeeeeeeeeee"))
    assert r.status_code == 201
    alerts = admin.get("/api/stock-alerts").get_json()["alerts"]
    assert len(alerts) == 1 and alerts[0]["stock_after"] == -1 and alerts[0]["product"] == "Última pieza"
    assert admin.post(f"/api/stock-alerts/{alerts[0]['id']}/review").status_code == 200
    assert admin.get("/api/stock-alerts").get_json()["alerts"] == []


def test_online_sale_still_409(seller, v_one_left):
    seller.post("/api/sales", json=sale_body(v_one_left, "11111111-0000-4000-8000-000000000007"))
    r = seller.post("/api/sales", json=sale_body(v_one_left, "11111111-0000-4000-8000-000000000008"),
                    headers=hdr("op-ffffffffffff", offline=False))
    assert r.status_code == 409


def test_business_error_releases_uid(seller, v1):
    bad = {"id": "11111111-0000-4000-8000-000000000009", "items": [{"variant_id": v1, "qty": 1}],
           "payments": [{"method": "card", "amount_cents": 1}]}
    assert seller.post("/api/sales", json=bad, headers=hdr("op-gggggggggggg")).status_code == 400
    r = seller.post("/api/sales", json=sale_body(v1, "11111111-0000-4000-8000-000000000009"), headers=hdr("op-gggggggggggg"))
    assert r.status_code == 201


def test_offline_client_and_layaway_payment(seller, v1):
    when = (datetime.now() - timedelta(hours=1)).replace(microsecond=0)
    c = seller.post("/api/clients", json={"id": "22222222-0000-4000-8000-000000000001", "name": "Sin señal"},
                    headers=hdr("op-client-00001", when)).get_json()["client"]
    assert c["created_at"] == when.isoformat()
    l = seller.post("/api/layaways", json={"id": "33333333-0000-4000-8000-000000000001", "client_id": c["id"],
                                           "items": [{"variant_id": v1, "qty": 1}],
                                           "payments": [{"method": "card", "amount_cents": 10000}]},
                    headers=hdr("op-layaway-0001", when)).get_json()["layaway"]
    assert l["created_at"] == when.isoformat()
    r = seller.post(f"/api/layaways/{l['id']}/payments", json={"id": "pay-offline-0001", "payments": [{"method": "card", "amount_cents": 5000}]},
                    headers=hdr("op-payment-0001", when))
    assert r.get_json()["layaway"]["payments"][-1]["created_at"] == when.isoformat()


def test_audit_records_offline_flag(admin, seller, v1):
    seller.post("/api/sales", json=sale_body(v1, "11111111-0000-4000-8000-00000000000a"), headers=hdr("op-hhhhhhhhhhhh"))
    entries = admin.get("/api/audit").get_json()["entries"]
    e = next(x for x in entries if x["action"] == "Registró venta")
    assert e["offline"] is True and e["user"] == "Vendedor"


def test_audit_records_admin_actions(admin, v1):
    admin.post("/api/expenses", json={"description": "Luz", "category": "Luz e internet", "amount_cents": 100})
    assert any(x["action"] == "Registró gasto" for x in admin.get("/api/audit").get_json()["entries"])


def test_seller_cannot_read_audit_or_alerts(seller):
    assert seller.get("/api/audit").status_code == 403
    assert seller.get("/api/stock-alerts").status_code == 403
