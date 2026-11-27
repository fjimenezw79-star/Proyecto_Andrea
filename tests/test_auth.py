def test_login_ok(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200 and r.get_json()["user"]["role"] == "admin"


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "x"})
    assert r.status_code == 401
    assert r.get_json()["message"] == "Usuario o contraseña incorrectos."


def test_lockout_after_5_failures(client):
    for _ in range(5):
        client.post("/api/auth/login", json={"username": "admin", "password": "x"})
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 429
    assert "Intenta de nuevo en" in r.get_json()["message"]


def test_api_requires_login(client):
    assert client.get("/api/auth/me").status_code == 401


def test_inactive_user_cannot_login(app, client):
    from server.db import session
    from server.models import User

    with app.app_context():
        u = session.query(User).filter_by(username="vendedor").one()
        u.active = False
        session.commit()
    r = client.post("/api/auth/login", json={"username": "vendedor", "password": "12345"})
    assert r.status_code == 401


def test_me_and_logout(admin):
    assert admin.get("/api/auth/me").get_json()["user"]["username"] == "admin"
    admin.post("/api/auth/logout")
    assert admin.get("/api/auth/me").status_code == 401


def test_csrf_required_outside_tests(tmp_path):
    from server import create_app
    from server.config import TestConfig

    class Cfg(TestConfig):
        WTF_CSRF_ENABLED = True
        DATABASE = str(tmp_path / "c.db")
        UPLOAD_DIR = str(tmp_path / "f")
        BACKUP_DIR = str(tmp_path / "r")

    c = create_app(Cfg).test_client()
    body = {"username": "admin", "password": "admin123"}
    assert c.post("/api/auth/login", json=body).status_code == 400
    token = c.get("/api/auth/csrf").get_json()["token"]
    assert c.post("/api/auth/login", json=body, headers={"X-CSRFToken": token}).status_code == 200
