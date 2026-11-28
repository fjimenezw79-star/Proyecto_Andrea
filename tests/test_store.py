"""Etapa 6: tienda en línea pública y pedidos en línea."""
import json
import re
import uuid

import pytest

from server.db import session
from server.models import Client, Sale, StockMovement, Variant
from tests.conftest import make_jpeg, post_product


def store_data(html: str) -> dict:
    m = re.search(r'<script id="store-data" type="application/json">(.*?)</script>', html, re.S)
    return json.loads(m.group(1))


def order(variant_id, qty=1, **kw):
    return {"id": str(uuid.uuid4()), "folio": "W-ABCDE", "name": "Laura Pérez", "phone": "473 111 2233",
            "delivery": "pickup", "items": [{"variant_id": variant_id, "qty": qty}], **kw}


@pytest.fixture(autouse=True)
def _reset_limit():
    import server.store as store
    store._hits.clear()


@pytest.fixture()
def public(app):
    return app.test_client()  # visitante sin sesión


# ---------------- páginas públicas ----------------

def test_home_lists_online_products_without_login(public, v1, v2):
    r = public.get("/tienda/")
    assert r.status_code == 200
    html = r.get_data(as_text=True)
    d = store_data(html)
    assert {p["name"] for p in d["products"]} == {"Princesas Disney", "Botella deportiva"}
    p = next(x for x in d["products"] if x["name"] == "Princesas Disney")
    assert p["price"] == 35000 and p["stock"] == 3 and p["dept"] == "Mochilas"
    assert p["imgs"][0].startswith("/tienda/img/") and p["url"].startswith("/tienda/p/princesas-disney-")
    assert "cost_cents" not in json.dumps(d) and 20000 not in [p["price"] for p in d["products"]]  # el costo nunca sale a la tienda
    assert '<meta property="og:title" content="Modas Andrea · Tienda en línea">' in html
    assert public.get("/tienda").status_code == 301


def test_product_page_has_preview_for_whatsapp(public, v1):
    d = store_data(public.get("/tienda/").get_data(as_text=True))
    p = d["products"][0]
    r = public.get(p["url"])
    html = r.get_data(as_text=True)
    assert r.status_code == 200
    assert 'property="og:title" content="Princesas Disney · $350 · Modas Andrea"' in html
    assert re.search(r'property="og:image" content="http://localhost/tienda/og/\d+\.jpg"', html)
    assert 'content="in stock"' in html
    assert store_data(html)["open"] == p["id"]
    og = public.get(f"/tienda/og/{p['id']}.jpg")
    assert og.status_code == 200 and og.mimetype == "image/jpeg"
    # un link viejo con otro nombre redirige al actual
    assert public.get(f"/tienda/p/otro-nombre-{p['id']}/").status_code == 301


def test_hidden_products_and_private_photos(admin, public, v1, product2):
    d = store_data(public.get("/tienda/").get_data(as_text=True))
    hidden = next(p for p in d["products"] if p["name"] == "Mario Bros")
    admin.patch(f"/api/products/{hidden['id']}", json={"online": False})
    d2 = store_data(public.get("/tienda/").get_data(as_text=True))
    assert "Mario Bros" not in {p["name"] for p in d2["products"]}
    assert public.get(hidden["url"]).status_code == 404
    assert public.get(hidden["imgs"][0]).status_code == 404  # su foto deja de ser pública
    shown = next(p for p in d2["products"] if p["name"] == "Princesas Disney")
    assert public.get(shown["imgs"][0]).status_code == 200
    assert public.get("/tienda/img/no-existe.webp").status_code == 404


def test_sold_out_shows_or_hides(admin, public, product):
    d = store_data(public.get("/tienda/").get_data(as_text=True))
    assert d["products"][0]["stock"] == 0  # agotado: se muestra con la etiqueta
    assert 'content="out of stock"' in public.get(d["products"][0]["url"]).get_data(as_text=True)
    admin.put("/api/settings", json={"store_hide_sold_out": True})
    assert store_data(public.get("/tienda/").get_data(as_text=True))["products"] == []
    assert admin.put("/api/settings", json={"store_hide_sold_out": "si"}).status_code == 400


def test_store_texts_come_from_settings(admin, public, v1):
    admin.put("/api/settings", json={"business_name": "Yuda Store", "store_tagline": "Hola\nmundo", "whatsapp": "4731234567",
                                     "business_hours": "Lun a Sáb 10 a 8"})
    html = public.get("/tienda/").get_data(as_text=True)
    assert "<b>Yuda Store</b>" in html and "<em>mundo</em>" in html and "Lun a Sáb 10 a 8" in html
    assert store_data(html)["biz"]["whatsapp"] == "524731234567"


def test_assets_are_served(public):
    assert public.get("/tienda/tienda.js").status_code == 200
    assert public.get("/tienda/tienda.css").status_code == 200
    assert public.get("/tienda/fonts/instrument-serif-latin-400-normal.woff2").status_code == 200


# ---------------- pedidos desde la tienda ----------------

def test_order_is_received_once(public, admin, v1):
    body = order(v1, 2, note="Para regalo")
    r = public.post("/tienda/api/pedido", json=body)
    assert r.status_code == 201, r.get_json()
    assert r.get_json()["folio"] == "W-ABCDE"
    again = public.post("/tienda/api/pedido", json=body)  # reintento por mala señal
    assert again.status_code == 201 and again.get_json()["folio"] == "W-ABCDE"
    orders = admin.get("/api/online-orders?status=pending").get_json()["orders"]
    assert len(orders) == 1
    o = orders[0]
    assert o["phone"] == "4731112233" and o["subtotal_cents"] == 70000 and o["items"][0]["name"] == "Princesas Disney"
    assert admin.get("/api/online-orders/counts").get_json()["counts"]["pending"] == 1


def test_order_folio_collision_gets_new_folio(public, v1):
    public.post("/tienda/api/pedido", json=order(v1))
    r = public.post("/tienda/api/pedido", json=order(v1))
    assert r.status_code == 201 and r.get_json()["folio"] != "W-ABCDE"
    assert re.match(r"^W-[A-Z0-9]{5}$", r.get_json()["folio"])


@pytest.mark.parametrize("change,field", [
    ({"name": ""}, "name"), ({"phone": "123"}, "phone"), ({"delivery": "shipping"}, "address"),
    ({"items": []}, "items"), ({"id": "x"}, "id"),
], ids=["sin-nombre", "telefono-corto", "envio-sin-direccion", "sin-productos", "id-invalido"])
def test_order_validation(public, v1, change, field):
    r = public.post("/tienda/api/pedido", json={**order(v1), **change})
    assert r.status_code == 400 and r.get_json()["field"] == field


def test_order_rejects_products_not_in_store(admin, public, v1):
    d = admin.get("/api/products?q=Princesas").get_json()["products"][0]
    admin.patch(f"/api/products/{d['id']}", json={"online": False})
    r = public.post("/tienda/api/pedido", json=order(v1))
    assert r.status_code == 400 and r.get_json()["field"] == "items"


def test_order_rate_limit(public, v1):
    codes = [public.post("/tienda/api/pedido", json=order(v1)).status_code for _ in range(10)]
    assert codes[:8] == [201] * 8 and codes[8] == 429


def test_orders_api_is_admin_only(seller, public):
    assert seller.get("/api/online-orders").status_code == 403
    assert public.get("/api/online-orders").status_code == 401


# ---------------- confirmar, cobrar y rechazar ----------------

def _pending(public, admin, variant_id, qty=1, **kw):
    public.post("/tienda/api/pedido", json=order(variant_id, qty, **kw))
    return admin.get("/api/online-orders?status=pending").get_json()["orders"][0]


def test_confirm_reserves_stock_and_charge_creates_sale(app, public, admin, v1):
    o = _pending(public, admin, v1, 2, delivery="shipping", address="Calle 1 #2")
    r = admin.post(f"/api/online-orders/{o['id']}/confirm", json={"shipping_cents": 5000})
    assert r.status_code == 200, r.get_json()
    assert r.get_json()["order"]["total_cents"] == 75000
    with app.app_context():
        assert session.get(Variant, v1).stock == 1  # 3 − 2 apartadas
        client = session.query(Client).filter_by(phone="4731112233").one()
        assert client.name == "Laura Pérez"
    # no se puede confirmar dos veces
    assert admin.post(f"/api/online-orders/{o['id']}/confirm", json={}).status_code == 400

    r = admin.post(f"/api/online-orders/{o['id']}/charge", json={"payments": [{"method": "transfer", "amount_cents": 75000}]})
    assert r.status_code == 200, r.get_json()
    sale = r.get_json()["sale"]
    assert sale["source"] == "online" and sale["total_cents"] == 75000 and sale["shipping_cents"] == 5000
    assert sale["client_name"] == "Laura Pérez" and sale["items"][0]["qty"] == 2
    with app.app_context():
        assert session.get(Variant, v1).stock == 1  # no se descuenta otra vez
        assert session.query(Client).filter_by(phone="4731112233").one().points == 70  # $700 → 70 puntos
        assert session.query(StockMovement).filter_by(reason="online").count() == 1
        assert session.get(Sale, sale["id"]).note == f"Pedido en línea {o['folio']}"
    assert admin.get("/api/online-orders?status=paid").get_json()["orders"][0]["sale_id"] == sale["id"]


def test_existing_client_is_reused(app, public, admin, v1):
    c = admin.post("/api/clients", json={"name": "Laura P.", "phone": "4731112233"}).get_json()["client"]
    o = _pending(public, admin, v1)
    assert admin.post(f"/api/online-orders/{o['id']}/confirm", json={}).get_json()["order"]["client_id"] == c["id"]


def test_confirm_without_stock_is_409_and_changes_nothing(app, public, admin, v1):
    o = _pending(public, admin, v1, 5)
    r = admin.post(f"/api/online-orders/{o['id']}/confirm", json={})
    assert r.status_code == 409
    assert "Princesas Disney" in r.get_json()["message"] and "Quedan 3" in r.get_json()["message"]
    with app.app_context():
        assert session.get(Variant, v1).stock == 3
    assert admin.get(f"/api/online-orders/{o['id']}").get_json()["order"]["status"] == "pending"


def test_pickup_order_cannot_have_shipping(public, admin, v1):
    o = _pending(public, admin, v1)
    assert admin.post(f"/api/online-orders/{o['id']}/confirm", json={"shipping_cents": 100}).status_code == 400


def test_charge_requires_confirm_and_exact_payment(public, admin, v1):
    o = _pending(public, admin, v1)
    assert admin.post(f"/api/online-orders/{o['id']}/charge", json={"payments": [{"method": "card", "amount_cents": 35000}]}).status_code == 400
    admin.post(f"/api/online-orders/{o['id']}/confirm", json={})
    assert admin.post(f"/api/online-orders/{o['id']}/charge", json={"payments": [{"method": "card", "amount_cents": 100}]}).status_code == 400


def test_reject_returns_reserved_stock(app, public, admin, v1):
    o = _pending(public, admin, v1, 2)
    admin.post(f"/api/online-orders/{o['id']}/confirm", json={})
    assert admin.post(f"/api/online-orders/{o['id']}/reject", json={}).status_code == 400  # falta el motivo
    r = admin.post(f"/api/online-orders/{o['id']}/reject", json={"reason": "El cliente ya no lo quiere"})
    assert r.status_code == 200 and r.get_json()["order"]["status"] == "rejected"
    with app.app_context():
        assert session.get(Variant, v1).stock == 3
    assert admin.post(f"/api/online-orders/{o['id']}/reject", json={"reason": "x"}).status_code == 400


def test_order_actions_go_to_audit_log(public, admin, v1):
    o = _pending(public, admin, v1)
    admin.post(f"/api/online-orders/{o['id']}/confirm", json={})
    log = admin.get("/api/audit").get_json()
    entries = log.get("entries") or log.get("items") or log.get("log") or []
    assert any(e["action"] == "Confirmó pedido en línea" for e in entries)


def test_store_status_without_cloudflare(admin):
    d = admin.get("/api/store").get_json()
    assert d["local_url"].endswith("/tienda/") and d["cloud"]["configured"] is False
    assert admin.post("/api/store/publish").status_code == 409
