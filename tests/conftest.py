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


def _variant_with_stock(admin, cat_id, name, price, cost, stock):
    r = post_product(admin, {"name": name, "category_id": cat_id, "price_cents": price, "cost_cents": cost},
                     [(make_jpeg(), "x.jpg")])
    vid = r.get_json()["product"]["variants"][0]["id"]
    admin.post("/api/inventory/entries", json={"items": [{"variant_id": vid, "qty": stock}]})
    return vid


@pytest.fixture()
def v1(admin, cat_id):
    return _variant_with_stock(admin, cat_id, "Princesas Disney", 35000, 20000, 3)


@pytest.fixture()
def v2(admin, cat_id, v1):
    return _variant_with_stock(admin, cat_id, "Botella deportiva", 19000, 9000, 4)


@pytest.fixture()
def v_one_left(admin, cat_id):
    return _variant_with_stock(admin, cat_id, "Última pieza", 35000, 20000, 1)


@pytest.fixture()
def seller_user(app):
    from server.db import session
    from server.models import User
    from server.security import SessionUser

    with app.app_context():
        return SessionUser(session.query(User).filter_by(username="vendedor").one())


from pathlib import Path as _Path


@pytest.fixture()
def repo_root():
    return _Path(__file__).resolve().parents[1]


@pytest.fixture()
def legacy_db(repo_root):
    return repo_root / "tests" / "fixtures" / "legacy" / "bazarges_data.db"


@pytest.fixture()
def client_id(seller):
    return seller.post("/api/clients", json={"name": "Laura Pérez", "phone": "4731234567"}).get_json()["client"]["id"]


@pytest.fixture()
def client_with_credit(app, client_id):
    from server.db import session
    from server.models import Client

    with app.app_context():
        session.get(Client, client_id).credit_cents = 10000
        session.commit()
    return client_id


@pytest.fixture()
def admin_user(app):
    from server.db import session
    from server.models import User
    from server.security import SessionUser

    with app.app_context():
        return SessionUser(session.query(User).filter_by(username="admin").one())
