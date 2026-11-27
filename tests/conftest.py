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
