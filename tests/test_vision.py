"""Etapa 5: huellas de fotos (reconocimiento visual) y configuración de tickets y etiquetas."""
import base64

from sqlalchemy import inspect

from server.db import session
from server.models import PhotoEmbedding
from tests.conftest import make_jpeg, post_product

MODEL = "mobilenet_v3_small"


def vec(fill: int = 1, size: int = 1024) -> str:
    return base64.b64encode(bytes([fill % 256]) * size).decode()


def new_product(client, cat, name="Termo azul"):
    r = post_product(client, {"name": name, "category_id": cat, "price_cents": 25000},
                     [(make_jpeg(), "a.jpg"), (make_jpeg(), "b.jpg")])
    assert r.status_code == 201, r.get_json()
    return r.get_json()["product"]


def test_tables_exist(app):
    with app.app_context():
        names = inspect(session.get_bind()).get_table_names()
    assert {"photo_embeddings", "ai_queries"} <= set(names)


def test_missing_save_and_index(admin, seller, cat_id):
    p = new_product(admin, cat_id)
    missing = admin.get("/api/vision/missing").get_json()
    assert missing["model"] == MODEL
    ids = [m["photo_id"] for m in missing["photos"]]
    assert ids == [ph["id"] for ph in p["photos"]]
    assert missing["photos"][0]["url"].startswith("/uploads/")

    r = admin.put("/api/vision/embeddings", json={"model": MODEL, "items": [{"photo_id": ids[0], "v": vec(3)}]})
    assert r.status_code == 200, r.get_json()
    assert r.get_json()["saved"] == 1
    assert [m["photo_id"] for m in admin.get("/api/vision/missing").get_json()["photos"]] == [ids[1]]

    idx = seller.get("/api/vision/index").get_json()
    assert idx["model"] == MODEL
    assert idx["items"] == [{"photo_id": ids[0], "product_id": p["id"], "v": vec(3)}]

    # guardar otra vez la misma foto la reemplaza
    admin.put("/api/vision/embeddings", json={"model": MODEL, "items": [{"photo_id": ids[0], "v": vec(9)}]})
    assert seller.get("/api/vision/index").get_json()["items"][0]["v"] == vec(9)


def test_missing_filters_by_product(admin, cat_id):
    a = new_product(admin, cat_id, "Termo")
    new_product(admin, cat_id, "Cobija")
    photos = admin.get(f"/api/vision/missing?product={a['id']}").get_json()["photos"]
    assert {m["product_id"] for m in photos} == {a["id"]}


def test_rejects_bad_embeddings(admin, seller, cat_id):
    p = new_product(admin, cat_id)
    pid = p["photos"][0]["id"]
    put = lambda body: admin.put("/api/vision/embeddings", json=body)  # noqa: E731
    assert put({"model": "otro_modelo", "items": [{"photo_id": pid, "v": vec()}]}).status_code == 400
    assert put({"model": MODEL, "items": [{"photo_id": pid, "v": vec(size=10)}]}).status_code == 400
    assert put({"model": MODEL, "items": [{"photo_id": pid, "v": "no-es-base64!!"}]}).status_code == 400
    assert put({"model": MODEL, "items": [{"photo_id": 99999, "v": vec()}]}).status_code == 404
    assert put({"model": MODEL, "items": []}).status_code == 400
    assert seller.put("/api/vision/embeddings", json={"model": MODEL, "items": [{"photo_id": pid, "v": vec()}]}).status_code == 403
    assert seller.get("/api/vision/missing").status_code == 403


def test_other_model_counts_as_missing_and_is_not_indexed(app, admin, seller, cat_id):
    p = new_product(admin, cat_id)
    pid = p["photos"][0]["id"]
    with app.app_context():
        session.add(PhotoEmbedding(photo_id=pid, model="modelo_viejo", dim=1024, vector=vec()))
        session.commit()
    assert pid in [m["photo_id"] for m in admin.get("/api/vision/missing").get_json()["photos"]]
    assert seller.get("/api/vision/index").get_json()["items"] == []


def test_embedding_deleted_with_photo_and_inactive_products_hidden(admin, seller, cat_id):
    p = new_product(admin, cat_id)
    a, b = (ph["id"] for ph in p["photos"])
    admin.put("/api/vision/embeddings", json={"model": MODEL, "items": [{"photo_id": a, "v": vec()}, {"photo_id": b, "v": vec()}]})
    assert admin.delete(f"/api/products/{p['id']}/photos/{a}").status_code == 200
    assert [i["photo_id"] for i in seller.get("/api/vision/index").get_json()["items"]] == [b]
    admin.patch(f"/api/products/{p['id']}", json={"active": False})
    assert seller.get("/api/vision/index").get_json()["items"] == []


def test_new_settings(admin, seller):
    s = seller.get("/api/settings").get_json()["settings"]
    assert s["ticket_footer"] == "¡Gracias por tu compra!"
    assert s["label_size"] == "50x25"
    assert s["ai_monthly_limit"] == 100
    assert admin.put("/api/settings", json={"label_size": "carta-30", "ticket_footer": "Cambios en 7 días",
                                            "ai_monthly_limit": 0}).status_code == 200
    assert admin.put("/api/settings", json={"label_size": "a4-99"}).status_code == 400
    assert admin.put("/api/settings", json={"ai_monthly_limit": -1}).status_code == 400
    assert admin.put("/api/settings", json={"ticket_footer": "x" * 201}).status_code == 400


def test_index_version_avoids_downloading_again(admin, seller, cat_id):
    p = new_product(admin, cat_id)
    pid = p["photos"][0]["id"]
    first = seller.get("/api/vision/index").get_json()
    again = seller.get(f"/api/vision/index?version={first['version']}").get_json()
    assert again["unchanged"] is True and "items" not in again
    admin.put("/api/vision/embeddings", json={"model": MODEL, "items": [{"photo_id": pid, "v": vec()}]})
    changed = seller.get(f"/api/vision/index?version={first['version']}").get_json()
    assert "unchanged" not in changed and len(changed["items"]) == 1
    admin.patch(f"/api/products/{p['id']}", json={"active": False})
    assert seller.get(f"/api/vision/index?version={changed['version']}").get_json().get("unchanged") is None
