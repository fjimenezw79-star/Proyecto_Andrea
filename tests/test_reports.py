from datetime import date, timedelta

from tests.conftest import _variant_with_stock

TODAY = date.today().isoformat()


def sell(c, vid, qty=1, total=35000, client=None):
    body = {"items": [{"variant_id": vid, "qty": qty}], "payments": [{"method": "card", "amount_cents": total}]}
    if client:
        body["client_id"] = client
    r = c.post("/api/sales", json=body)
    assert r.status_code == 201, r.get_json()
    return r.get_json()["sale"]


def summary(c, frm=TODAY, to=TODAY):
    return c.get(f"/api/reports/summary?from={frm}&to={to}").get_json()


def test_summary_math(admin, v1):                      # v1: $350, costo $200
    sell(admin, v1)
    b = sell(admin, v1)
    iid = admin.get(f"/api/sales/{b['id']}").get_json()["sale"]["items"][0]["id"]
    admin.post(f"/api/sales/{b['id']}/returns", json={"items": [{"sale_item_id": iid, "qty": 1}],
                                                      "refund_method": "card", "reason": "x"})
    admin.post("/api/expenses", json={"description": "Bolsas", "category": "Insumos", "amount_cents": 5000})
    s = summary(admin)["summary"]
    assert (s["sales_cents"], s["returns_cents"], s["net_cents"]) == (70000, 35000, 35000)
    assert (s["cost_cents"], s["gross_profit_cents"], s["expenses_cents"], s["net_profit_cents"]) == (20000, 15000, 5000, 10000)
    assert s["tickets"] == 2 and s["avg_ticket_cents"] == 35000
    r = summary(admin)
    assert r["top_products"][0]["name"] == "Princesas Disney" and r["top_products"][0]["qty"] == 1
    assert r["by_category"][0]["category"] == "Mochilas" and r["daily"][-1] == {"date": TODAY, "net_cents": 35000}
    assert r["by_seller"][0]["name"] == "Administrador"


def test_cancelled_excluded(admin, v1):
    a = sell(admin, v1)
    admin.post(f"/api/sales/{a['id']}/cancel", json={"reason": "error"})
    assert summary(admin)["summary"]["sales_cents"] == 0


def test_layaway_counts_on_settle_day(admin, v1, client_id):
    l = admin.post("/api/layaways", json={"client_id": client_id, "items": [{"variant_id": v1, "qty": 1}],
                                         "payments": [{"method": "card", "amount_cents": 10000}]}).get_json()["layaway"]
    assert summary(admin)["summary"]["sales_cents"] == 0
    admin.post(f"/api/layaways/{l['id']}/settle", json={"payments": [{"method": "card", "amount_cents": 25000}]})
    s = summary(admin)
    assert s["summary"]["sales_cents"] == 35000
    assert s["by_method"]["card"] == 35000


def test_csv_has_bom_and_rows(admin, v1):
    sell(admin, v1)
    r = admin.get(f"/api/reports/sales.csv?from={TODAY}&to={TODAY}")
    assert r.status_code == 200 and r.data.startswith("﻿".encode())
    text = r.data.decode("utf-8-sig").splitlines()
    assert text[0].startswith("Fecha,Folio,Vendedor") and "Princesas Disney" in text[1] and len(text) == 2


def test_seller_cannot_see_reports(seller):
    assert seller.get("/api/reports/summary").status_code == 403


def test_dashboard_depletion(admin, cat_id):
    fast = _variant_with_stock(admin, cat_id, "Rápido", 1000, 500, 7)
    sell(admin, fast, qty=5, total=5000)
    d = admin.get("/api/dashboard").get_json()
    dep = {x["variant_id"]: x for x in d["depletion"]}
    assert dep[fast]["days_left"] == 12 and dep[fast]["stock"] == 2
    assert d["today_cents"] == 5000 and d["month_profit_cents"] == 2500


def test_dashboard_layaways_due(admin, v1, client_id):
    admin.post("/api/layaways", json={"client_id": client_id, "items": [{"variant_id": v1, "qty": 1}],
                                      "deadline": (date.today() + timedelta(days=3)).isoformat(),
                                      "payments": [{"method": "card", "amount_cents": 10000}]})
    assert admin.get("/api/dashboard").get_json()["layaways_due"][0]["balance_cents"] == 25000


def test_seller_sees_dashboard_without_profit(seller):
    d = seller.get("/api/dashboard").get_json()
    assert "today_cents" in d and "month_profit_cents" not in d
