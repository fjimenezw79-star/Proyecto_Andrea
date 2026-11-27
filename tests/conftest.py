import pytest

from server import create_app
from server.config import TestConfig


@pytest.fixture()
def app(tmp_path):
    class Cfg(TestConfig):
        DATABASE = str(tmp_path / "test.db")
        UPLOAD_DIR = str(tmp_path / "fotos")
        BACKUP_DIR = str(tmp_path / "respaldos")

    return create_app(Cfg)


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, username="admin", password="admin123"):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.get_json()
    return client


@pytest.fixture()
def admin(app):
    return login(app.test_client())


@pytest.fixture()
def seller(app):
    return login(app.test_client(), "vendedor", "12345")


import io
import json as _json


def make_jpeg(gps: bool = False) -> io.BytesIO:
    from PIL import Image

    buf = io.BytesIO()
    im = Image.new("RGB", (20, 20), (200, 30, 60))
    if gps:
        exif = Image.Exif()
        exif[0x010F] = "CamaraPrueba"  # Make
        exif[0x8825] = {1: "N", 2: (20.0, 55.0, 0.0)}  # GPSInfo
        im.save(buf, "JPEG", exif=exif.tobytes())
    else:
        im.save(buf, "JPEG")
    buf.seek(0)
    return buf


def post_product(client, data, photos):
    return client.post("/api/products", data={"data": _json.dumps(data), "photos": photos},
                       content_type="multipart/form-data")


@pytest.fixture()
def jpeg():
    return make_jpeg


@pytest.fixture()
def jpeg_with_gps():
    return lambda: make_jpeg(gps=True)


@pytest.fixture()
def cat_id(admin):
    return admin.post("/api/categories", json={"name": "Mochilas"}).get_json()["category"]["id"]


@pytest.fixture()
def product(admin, cat_id):
    r = post_product(admin, {"name": "Princesas Disney", "category_id": cat_id, "price_cents": 35000,
                             "cost_cents": 20000}, [(make_jpeg(), "a.jpg")])
    return r.get_json()["product"]


@pytest.fixture()
def product2(admin, cat_id):
    r = post_product(admin, {"name": "Mario Bros", "category_id": cat_id, "price_cents": 32000,
                             "cost_cents": 18000}, [(make_jpeg(), "b.jpg")])
    return r.get_json()["product"]


@pytest.fixture()
def stocked_variant(admin, product):
    vid = product["variants"][0]["id"]
    r = admin.post("/api/inventory/entries", json={"items": [{"variant_id": vid, "qty": 5}], "note": "Inicial"})
    assert r.status_code == 200, r.get_json()
    return vid
