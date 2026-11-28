import threading

import pytest


def sell(c, vid, qty, total, discount=0, client=None, method="card"):
    body = {"items": [{"variant_id": vid, "qty": qty}], "discount_cents": discount,
            "payments": [{"method": method, "amount_cents": total, **({"received_cents": total} if method == "cash" else {})}]}
    if client:
        body["client_id"] = client
    r = c.post("/api/sales", json=body)
    assert r.status_code == 201, r.get_json()
    return r.get_json()["sale"]


@pytest.fixture()
def sale_2x(admin, v1):
    return sell(admin, v1, 2, 63000, discount=7000)


def item_id(admin, sale):
    return admin.get(f"/api/sales/{sale['id']}").get_json()["sale"]["items"][0]["id"]


def ret(admin, sale, qty, method="cash", reason="No le quedó"):
    return admin.post(f"/api/sales/{sale['id']}/returns",
                      json={"items": [{"sale_item_id": item_id(admin, sale), "qty": qty}],
                            "refund_method": method, "reason": reason})


def stock(c, code="MA000001"):
    return c.get(f"/api/variants/lookup?code={code}").get_json()["variant"]["stock"]


def test_partial_return_refund_and_stock(admin, sale_2x):
    r = ret(admin, sale_2x, 1)
    assert r.status_code == 201 and r.get_json()["return"]["refund_cents"] == 31500
    assert stock(admin) == 2
    s = admin.get(f"/api/sales/{sale_2x['id']}").get_json()["sale"]
    assert s["items"][0]["returned_qty"] == 1 and s["fully_returned"] is False


def test_cannot_return_more_than_sold(admin, sale_2x):
    ret(admin, sale_2x, 1)
    r = ret(admin, sale_2x, 2)
    assert r.status_code == 400 and r.get_json()["message"] == "Solo quedan 1 piezas por devolver de Princesas Disney."
    assert ret(admin, sale_2x, 1).get_json()["return"]["refund_cents"] == 31500
    assert admin.get(f"/api/sales/{sale_2x['id']}").get_json()["sale"]["fully_returned"] is True


def test_concurrent_returns_do_not_exceed(app, admin, v1, admin_user):
    sale = sell(admin, v1, 1, 35000)
    sid, iid = sale["id"], item_id(admin, sale)
    from server.services.returns import create_return

    results, barrier = [], threading.Barrier(2)

    def go():
        with app.app_context():
            barrier.wait()
            try:
                create_return(sid, {"items": [{"sale_item_id": iid, "qty": 1}], "refund_method": "card", "reason": "x"},
                              admin_user)
                results.append("ok")
            except Exception as e:  # noqa: BLE001
                results.append(type(e).__name__)

    ts = [threading.Thread(target=go) for _ in range(2)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert sorted(results) == ["ValidationError", "ok"]
    assert stock(admin) == 3


def test_points_reduced_never_negative(admin, v1, client_id):
    sale = sell(admin, v1, 2, 70000, client=client_id)
    assert admin.get(f"/api/clients/{client_id}").get_json()["client"]["points"] == 70
    ret(admin, sale, 1)
    assert admin.get(f"/api/clients/{client_id}").get_json()["client"]["points"] == 35


def test_credit_refund(admin, v1, client_id):
    sale = sell(admin, v1, 1, 35000, client=client_id)
    assert ret(admin, sale, 1, method="credit").status_code == 201
    assert admin.get(f"/api/clients/{client_id}").get_json()["client"]["credit_cents"] == 35000


def test_credit_refund_needs_client(admin, sale_2x):
    r = ret(admin, sale_2x, 1, method="credit")
    assert r.status_code == 400 and r.get_json()["field"] == "refund_method"


def test_reason_required(admin, sale_2x):
    assert ret(admin, sale_2x, 1, reason=" ").status_code == 400


def test_seller_cannot_return(seller, admin, sale_2x):
    r = seller.post(f"/api/sales/{sale_2x['id']}/returns",
                    json={"items": [{"sale_item_id": item_id(admin, sale_2x), "qty": 1}], "refund_method": "cash", "reason": "x"})
    assert r.status_code == 403


def test_cancelled_sale_rejects_return(admin, sale_2x):
    admin.post(f"/api/sales/{sale_2x['id']}/cancel", json={"reason": "error"})
    assert ret(admin, sale_2x, 1).status_code == 409


def test_cancel_after_partial_return_rejected(admin, sale_2x):
    ret(admin, sale_2x, 1)
    r = admin.post(f"/api/sales/{sale_2x['id']}/cancel", json={"reason": "error"})
    assert r.status_code == 409
