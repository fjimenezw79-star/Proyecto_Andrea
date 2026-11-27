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
