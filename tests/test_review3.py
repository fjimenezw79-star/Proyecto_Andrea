"""Hallazgos de la revisión final de la etapa 3."""
import sqlite3
import threading

import pytest


def test_upgrade_populated_0001_database(tmp_path):
    from alembic import command
    from alembic.config import Config

    db = tmp_path / "old.db"
    cfg = Config()
    cfg.set_main_option("script_location", "server/migrations")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db}")
    command.upgrade(cfg, "0001")
    c = sqlite3.connect(db)
    c.executescript("""
    PRAGMA foreign_keys=ON;
    INSERT INTO users(id,username,full_name,password_hash,role,active,created_at) VALUES(1,'admin','A','x','admin',1,'2026-01-01');
    INSERT INTO categories(id,name,slug,sort,active) VALUES(1,'C','c',0,1);
    INSERT INTO products(id,name,description,category_id,online,active,created_at,updated_at) VALUES(1,'P','',1,1,1,'2026-01-01','2026-01-01');
    INSERT INTO variants(id,product_id,sku,attrs,price_cents,cost_cents,stock,hidden,active) VALUES(1,1,'MA000001','{}',100,50,3,1,1);
    INSERT INTO clients(id,name,phone,email,points,notes,created_at) VALUES('c1','Ana','','',5,'','2026-01-01');
    INSERT INTO sales(id,folio,user_id,client_id,subtotal_cents,discount_cents,total_cents,status,note,created_at,cancel_reason) VALUES('s1',1,1,'c1',100,0,100,'paid','','2026-01-01','');
    INSERT INTO sale_items(sale_id,variant_id,qty,unit_price_cents,unit_cost_cents,discount_cents) VALUES('s1',1,1,100,50,0);
    INSERT INTO sale_payments(sale_id,method,amount_cents) VALUES('s1','cash',100);
    INSERT INTO stock_movements(variant_id,qty_delta,reason,note,created_at) VALUES(1,-1,'sale','','2026-01-01');
    """)
    c.commit()
    c.close()
    from server import create_app
    from server.config import TestConfig

    class Cfg(TestConfig):
        DATABASE = str(db)
        UPLOAD_DIR = str(tmp_path / "f")
        BACKUP_DIR = str(tmp_path / "r")

    app = create_app(Cfg)
    c = sqlite3.connect(db)
    assert c.execute("SELECT source FROM sales").fetchone() == ("pos",)
    assert c.execute("SELECT credit_cents, active FROM clients").fetchone() == (0, 1)
    assert c.execute("PRAGMA foreign_key_check").fetchall() == []
    assert app.test_client().get("/api/health").status_code == 200


def test_cli_main_after_history_functions():
    src = open("scripts/migrar_sistema_anterior.py", encoding="utf-8").read()
    assert src.index('if __name__ == "__main__"') > src.index("def _migrate_history")


def _sell(c, vid, payments, client=None, qty=1):
    body = {"items": [{"variant_id": vid, "qty": qty}], "payments": payments}
    if client:
        body["client_id"] = client
    r = c.post("/api/sales", json=body)
    assert r.status_code == 201, r.get_json()
    return r.get_json()["sale"]


def test_duplicate_line_in_one_return(admin, v1):
    s = _sell(admin, v1, [{"method": "card", "amount_cents": 35000}])
    iid = admin.get(f"/api/sales/{s['id']}").get_json()["sale"]["items"][0]["id"]
    r = admin.post(f"/api/sales/{s['id']}/returns", json={"items": [{"sale_item_id": iid, "qty": 1}, {"sale_item_id": iid, "qty": 1}],
                                                          "refund_method": "cash", "reason": "x"})
    assert r.status_code == 400
    assert admin.get("/api/variants/lookup?code=MA000001").get_json()["variant"]["stock"] == 2


def test_cancel_restores_store_credit(admin, v1, client_with_credit):
    s = _sell(admin, v1, [{"method": "credit", "amount_cents": 10000}, {"method": "card", "amount_cents": 25000}], client=client_with_credit)
    admin.post(f"/api/sales/{s['id']}/cancel", json={"reason": "error"})
    assert admin.get(f"/api/clients/{client_with_credit}").get_json()["client"]["credit_cents"] == 10000


def test_cannot_cancel_layaway_sale(admin, v1, client_id):
    l = admin.post("/api/layaways", json={"client_id": client_id, "items": [{"variant_id": v1, "qty": 1}],
                                         "payments": [{"method": "card", "amount_cents": 35000}]}).get_json()["layaway"]
    sale = admin.post(f"/api/layaways/{l['id']}/settle", json={}).get_json()["sale"]
    assert admin.post(f"/api/sales/{sale['id']}/cancel", json={"reason": "x"}).status_code == 409


def test_cancel_and_return_race(app, admin, v1, admin_user):
    s = _sell(admin, v1, [{"method": "card", "amount_cents": 70000}], qty=2)
    iid = admin.get(f"/api/sales/{s['id']}").get_json()["sale"]["items"][0]["id"]
    from server.services.returns import create_return
    from server.services.sales import cancel_sale

    barrier, out = threading.Barrier(2), []

    def ret():
        with app.app_context():
            barrier.wait()
            try:
                create_return(s["id"], {"items": [{"sale_item_id": iid, "qty": 1}], "refund_method": "card", "reason": "x"}, admin_user)
                out.append("ret")
            except Exception as e:  # noqa: BLE001
                out.append(type(e).__name__)

    def can():
        with app.app_context():
            barrier.wait()
            try:
                cancel_sale(s["id"], admin_user, "x")
                out.append("can")
            except Exception as e:  # noqa: BLE001
                out.append(type(e).__name__)

    ts = [threading.Thread(target=ret), threading.Thread(target=can)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    stock = admin.get("/api/variants/lookup?code=MA000001").get_json()["variant"]["stock"]
    assert stock == {"ret": 2, "can": 3}[next(x for x in out if x in ("ret", "can"))]
    assert sorted(out).count("ConflictError") + sorted(out).count("ret") + sorted(out).count("can") == 2


def test_cancel_in_later_session_hits_current_till(admin, v1):
    admin.post("/api/cash/open", json={"opening_cents": 0})
    s = _sell(admin, v1, [{"method": "cash", "amount_cents": 35000, "received_cents": 35000}])
    first = admin.post("/api/cash/close", json={"counted_cents": 35000}).get_json()["session"]
    assert first["difference_cents"] == 0
    admin.post("/api/cash/open", json={"opening_cents": 10000})
    admin.post(f"/api/sales/{s['id']}/cancel", json={"reason": "devolvió"})
    cur = admin.get("/api/cash/current").get_json()["summary"]
    assert cur["expected_cents"] == 10000 - 35000 + 0 or cur["expected_cents"] == -25000
    assert any(m["kind"] == "Venta cancelada" for m in cur["movements"])
    hist = admin.get("/api/cash/sessions").get_json()["sessions"][0]
    assert hist["expected_cents"] == 35000


def test_cancel_same_session_nets_zero(admin, v1):
    admin.post("/api/cash/open", json={"opening_cents": 0})
    s = _sell(admin, v1, [{"method": "cash", "amount_cents": 35000, "received_cents": 35000}])
    admin.post(f"/api/sales/{s['id']}/cancel", json={"reason": "error"})
    assert admin.get("/api/cash/current").get_json()["summary"]["expected_cents"] == 0


def test_points_fully_reversed_with_small_returns(admin, cat_id, client_id):
    from tests.conftest import _variant_with_stock

    vid = _variant_with_stock(admin, cat_id, "Lápiz", 950, 400, 4)
    s = _sell(admin, vid, [{"method": "card", "amount_cents": 1900}], client=client_id, qty=2)
    assert admin.get(f"/api/clients/{client_id}").get_json()["client"]["points"] == 1
    iid = admin.get(f"/api/sales/{s['id']}").get_json()["sale"]["items"][0]["id"]
    for _ in range(2):
        admin.post(f"/api/sales/{s['id']}/returns", json={"items": [{"sale_item_id": iid, "qty": 1}], "refund_method": "card", "reason": "x"})
    assert admin.get(f"/api/clients/{client_id}").get_json()["client"]["points"] == 0


def test_settle_retry_returns_same_result(seller, v1, client_id):
    l = seller.post("/api/layaways", json={"client_id": client_id, "items": [{"variant_id": v1, "qty": 1}],
                                          "payments": [{"method": "card", "amount_cents": 10000}]}).get_json()["layaway"]
    body = {"payment_id": "pay-final-0001", "payments": [{"method": "card", "amount_cents": 25000}]}
    a = seller.post(f"/api/layaways/{l['id']}/settle", json=body)
    b = seller.post(f"/api/layaways/{l['id']}/settle", json=body)
    assert a.status_code == b.status_code == 200 and a.get_json()["sale"]["id"] == b.get_json()["sale"]["id"]


def test_reused_payment_id_on_other_layaway_is_409(seller, v1, client_id):
    mk = lambda: seller.post("/api/layaways", json={"client_id": client_id, "items": [{"variant_id": v1, "qty": 1}],
                                                    "payments": [{"method": "card", "amount_cents": 1000}]}).get_json()["layaway"]["id"]
    a, b = mk(), mk()
    body = {"id": "same-pay-id-01", "payments": [{"method": "card", "amount_cents": 500}]}
    seller.post(f"/api/layaways/{a}/payments", json=body)
    assert seller.post(f"/api/layaways/{b}/payments", json=body).status_code == 409


def test_csv_escapes_formulas(admin, v1):
    cid = admin.post("/api/clients", json={"name": "=HYPERLINK(\"x\")"}).get_json()["client"]["id"]
    _sell(admin, v1, [{"method": "card", "amount_cents": 35000}], client=cid)
    from datetime import date
    d = date.today().isoformat()
    text = admin.get(f"/api/reports/sales.csv?from={d}&to={d}").data.decode("utf-8-sig")
    assert "'=HYPERLINK" in text


def test_client_keyerror_is_500_not_404(app, seller, monkeypatch):
    from server.services import clients

    monkeypatch.setattr(clients, "detail", lambda _id: {}["boom"])
    app.config["PROPAGATE_EXCEPTIONS"] = False
    assert seller.get("/api/clients/abc").status_code == 500


def test_by_seller_net_of_returns(admin, v1):
    from datetime import date
    s = _sell(admin, v1, [{"method": "card", "amount_cents": 35000}])
    iid = admin.get(f"/api/sales/{s['id']}").get_json()["sale"]["items"][0]["id"]
    admin.post(f"/api/sales/{s['id']}/returns", json={"items": [{"sale_item_id": iid, "qty": 1}], "refund_method": "card", "reason": "x"})
    d = date.today().isoformat()
    assert admin.get(f"/api/reports/summary?from={d}&to={d}").get_json()["by_seller"][0]["sales_cents"] == 0


def test_upgrade_from_0002_keeps_data(tmp_path):
    from alembic import command
    from alembic.config import Config

    db = tmp_path / "s3.db"
    cfg = Config()
    cfg.set_main_option("script_location", "server/migrations")
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db}")
    command.upgrade(cfg, "0002")
    c = sqlite3.connect(db)
    c.executescript("""
    INSERT INTO categories(id,name,slug,sort,active) VALUES(1,'C','c',0,1);
    INSERT INTO products(id,name,description,category_id,online,active,created_at,updated_at) VALUES(1,'P','',1,1,1,'2026-01-01','2026-01-01');
    INSERT INTO variants(id,product_id,sku,attrs,price_cents,cost_cents,stock,hidden,active) VALUES(1,1,'MA000001','{}',100,50,3,1,1);
    INSERT INTO stock_movements(variant_id,qty_delta,reason,note,created_at) VALUES(1,3,'import','','2026-01-01');
    """)
    c.commit()
    c.close()
    from server import create_app
    from server.config import TestConfig

    class Cfg(TestConfig):
        DATABASE = str(db)
        UPLOAD_DIR = str(tmp_path / "f")
        BACKUP_DIR = str(tmp_path / "r")

    create_app(Cfg)
    c = sqlite3.connect(db)
    assert c.execute("SELECT stock FROM variants").fetchone() == (3,)
    c.execute("UPDATE variants SET stock = -1")
    assert c.execute("SELECT stock FROM variants").fetchone() == (-1,)
