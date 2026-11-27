import io
import os
import pathlib

from tests.conftest import post_product as _post


def test_create_product_with_variants(admin, cat_id, jpeg):
    r = _post(admin, {"name": "Termo acero", "category_id": cat_id, "variants": [
        {"attrs": {"Color": "Azul", "Capacidad": "1 L"}, "price_cents": 39000, "cost_cents": 21000},
        {"attrs": {"Color": "Rosa", "Capacidad": "1 L"}, "price_cents": 39000, "cost_cents": 21000}]},
        [(jpeg(), "a.jpg")])
    assert r.status_code == 201
    p = r.get_json()["product"]
    assert [v["sku"] for v in p["variants"]] == ["MA000001", "MA000002"]
    assert all(v["stock"] == 0 for v in p["variants"]) and p["online"] is True


def test_single_price_product_gets_hidden_variant(product):
    assert len(product["variants"]) == 1
    v = product["variants"][0]
    assert v["hidden"] is True and v["price_cents"] == 35000 and v["sku"] == "MA000001"
    assert product["photos"][0]["url"].startswith("/uploads/")


def test_product_requires_photo(admin, cat_id):
    r = _post(admin, {"name": "Sin foto", "category_id": cat_id, "price_cents": 100, "cost_cents": 50}, [])
    assert r.status_code == 400 and r.get_json()["field"] == "photos"
    assert admin.get("/api/products").get_json()["products"] == []


def test_fake_image_rejected_and_nothing_saved(admin, cat_id, app):
    r = _post(admin, {"name": "X", "category_id": cat_id, "price_cents": 1, "cost_cents": 1},
              [(io.BytesIO(b"no soy foto"), "x.jpg")])
    assert r.status_code == 400
    assert os.listdir(app.config["UPLOAD_DIR"]) == []
    assert admin.get("/api/products").get_json()["products"] == []


def test_exif_removed(admin, cat_id, jpeg_with_gps, app):
    _post(admin, {"name": "Y", "category_id": cat_id, "price_cents": 1, "cost_cents": 1}, [(jpeg_with_gps(), "g.jpg")])
    from PIL import Image

    files = [f for f in pathlib.Path(app.config["UPLOAD_DIR"]).glob("*.webp") if not f.stem.endswith("_t")]
    assert len(files) == 1
    assert not Image.open(files[0]).getexif()


def test_lookup_by_sku_and_barcode(admin, product):
    v = product["variants"][0]
    admin.patch(f"/api/variants/{v['id']}", json={"barcode": "7501234567890"})
    assert admin.get("/api/variants/lookup?code=7501234567890").get_json()["variant"]["sku"] == v["sku"]
    assert admin.get(f"/api/variants/lookup?code={v['sku']}").status_code == 200
    r = admin.get("/api/variants/lookup?code=000")
    assert r.status_code == 404 and r.get_json()["message"] == "No encontramos ningún producto con ese código."


def test_duplicate_barcode(admin, product, product2):
    admin.patch(f"/api/variants/{product['variants'][0]['id']}", json={"barcode": "123"})
    r = admin.patch(f"/api/variants/{product2['variants'][0]['id']}", json={"barcode": "123"})
    assert r.status_code == 409


def test_cannot_delete_last_photo(admin, product):
    ph = product["photos"][0]["id"]
    assert admin.delete(f"/api/products/{product['id']}/photos/{ph}").status_code == 400


def test_add_then_delete_photo(admin, product, jpeg):
    r = admin.post(f"/api/products/{product['id']}/photos", data={"photos": [(jpeg(), "c.jpg")]},
                   content_type="multipart/form-data")
    assert len(r.get_json()["product"]["photos"]) == 2
    ph = product["photos"][0]["id"]
    assert admin.delete(f"/api/products/{product['id']}/photos/{ph}").status_code == 200


def test_seller_cannot_create(seller, cat_id, jpeg):
    r = _post(seller, {"name": "Z", "category_id": cat_id, "price_cents": 1, "cost_cents": 1}, [(jpeg(), "a.jpg")])
    assert r.status_code == 403


def test_search_and_update(admin, product, product2):
    names = [p["name"] for p in admin.get("/api/products?q=mario").get_json()["products"]]
    assert names == ["Mario Bros"]
    admin.patch(f"/api/products/{product['id']}", json={"online": False})
    assert admin.get(f"/api/products/{product['id']}").get_json()["product"]["online"] is False


def test_uploads_need_login(admin, product, client):
    url = product["photos"][0]["url"]
    assert admin.get(url).status_code == 200
    assert client.get(url).status_code == 401
