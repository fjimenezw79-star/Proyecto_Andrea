from datetime import datetime, timedelta


def hdr(uid, when=None, offline=True):
    """Encabezados de un reenvío de la cola. Sin hora explícita, la acción se hizo hace 5 minutos."""
    h = {"X-Client-Uid": uid}
    if when is None and offline:
        when = (datetime.now() - timedelta(minutes=5)).replace(microsecond=0)
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
    assert e["detail"].startswith("#") and "$" in e["detail"]


def test_audit_records_admin_actions(admin, v1):
    admin.post("/api/expenses", json={"description": "Luz", "category": "Luz e internet", "amount_cents": 100})
    assert any(x["action"] == "Registró gasto" for x in admin.get("/api/audit").get_json()["entries"])


def test_seller_cannot_read_audit_or_alerts(seller):
    assert seller.get("/api/audit").status_code == 403
    assert seller.get("/api/stock-alerts").status_code == 403


def test_offline_header_ignored_on_live_request(seller, v_one_left):
    """X-Offline solo vale en un reenvío real (hora del dispositivo con más de 30 s): no se brinca el stock en vivo."""
    now = datetime.now().replace(microsecond=0)
    h = {"X-Client-Uid": "op-live-000001", "X-Client-Time": now.isoformat(), "X-Offline": "1"}
    body = sale_body(v_one_left, "11111111-0000-4000-8000-00000000000b", qty=2, total=70000)
    assert seller.post("/api/sales", json=body, headers=h).status_code == 409


def test_client_time_ignored_without_offline_flag(seller, v1):
    when = (datetime.now() - timedelta(hours=3)).replace(microsecond=0)
    s = seller.post("/api/sales", json=sale_body(v1, "11111111-0000-4000-8000-00000000000c"),
                    headers=hdr("op-iiiiiiiiiiii", when, offline=False)).get_json()["sale"]
    assert datetime.fromisoformat(s["created_at"]) > datetime.now() - timedelta(minutes=1)


def test_replay_from_other_user_is_rejected(seller, admin, v1):
    body = sale_body(v1, "11111111-0000-4000-8000-00000000000d")
    assert seller.post("/api/sales", json=body, headers=hdr("op-jjjjjjjjjjjj")).status_code == 201
    r = admin.post("/api/sales", json=body, headers=hdr("op-jjjjjjjjjjjj"))
    assert r.status_code == 409 and r.headers.get("X-Replayed") is None


def test_offline_client_with_taken_phone_is_kept(seller, client_id):
    phone = seller.get(f"/api/clients/{client_id}").get_json()["client"]["phone"]
    assert phone
    r = seller.post("/api/clients", json={"id": "22222222-0000-4000-8000-000000000001", "name": "Ana sin señal", "phone": phone},
                    headers=hdr("op-client-dup01"))
    assert r.status_code == 201, r.get_json()
    c = r.get_json()["client"]
    assert c["phone"] == "" and phone in c["notes"]
    # en línea el teléfono repetido sigue rechazándose
    r = seller.post("/api/clients", json={"name": "Otra", "phone": phone})
    assert r.status_code == 409


def test_discard_is_recorded_in_audit(admin, seller):
    r = seller.post("/api/audit/discard", json={"label": "Venta P-1234 · $350.00", "reason": "Se cobró dos veces", "kind": "sale",
                                                "payload": {"id": "x"}})
    assert r.status_code == 200
    e = admin.get("/api/audit").get_json()["entries"][0]
    assert e["action"] == "Descartó acción sin señal" and "Venta P-1234" in e["detail"] and "Se cobró dos veces" in e["detail"]
    assert seller.post("/api/audit/discard", json={"label": "x", "reason": ""}).status_code == 400


def test_card_payments_count_in_the_cash_session_that_received_them(admin, v1, v2):
    admin.post("/api/cash/open", json={"opening_cents": 0})
    before = (datetime.now() - timedelta(hours=2)).replace(microsecond=0)  # antes de abrir la caja
    r = admin.post("/api/sales", json=sale_body(v1, "11111111-0000-4000-8000-00000000000e"), headers=hdr("op-kkkkkkkkkkkk", before))
    assert r.status_code == 201
    cur = admin.get("/api/cash/current").get_json()
    assert cur["summary"]["card_cents"] == 35000, cur
