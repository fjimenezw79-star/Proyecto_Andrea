from types import SimpleNamespace

TUNNEL = {"REMOTE_ADDR": "127.0.0.1"}
CF = {"HTTP_CF_CONNECTING_IP": "201.10.20.30"}


def test_connect_prefers_public_url_then_tunnel_then_lan(app, admin):
    d = admin.get("/api/connect").get_json()
    assert d["kind"] == "lan" and d["url"].startswith("http://") and d["url"] == d["lan_url"]
    assert d["offline_capable"] is False
    app.extensions["tunnel"] = SimpleNamespace(url="https://abc.trycloudflare.com", mode="prueba")
    d = admin.get("/api/connect").get_json()
    assert d["kind"] == "tunnel" and d["url"] == "https://abc.trycloudflare.com" and d["offline_capable"] is True
    assert d["temporary"] is True
    app.config["PUBLIC_URL"] = "https://modasandrea.example.com/"
    d = admin.get("/api/connect").get_json()
    assert d["kind"] == "fixed" and d["url"] == "https://modasandrea.example.com" and d["temporary"] is False


def test_connect_is_admin_only(seller):
    assert seller.get("/api/connect").status_code == 403
    assert seller.get("/api/connect/qr.svg").status_code == 403


def test_qr_svg(admin):
    r = admin.get("/api/connect/qr.svg")
    assert r.status_code == 200 and r.mimetype == "image/svg+xml"
    assert b"<svg" in r.data and b"<path" in r.data


def _login(client, username, password, **env):
    return client.post("/api/auth/login", json={"username": username, "password": password}, environ_base=env)


def test_default_password_blocked_over_tunnel(app):
    c = app.test_client()
    r = _login(c, "admin", "admin123", **TUNNEL, **CF)
    assert r.status_code == 403
    assert "Cambia la contraseña inicial" in r.get_json()["message"]
    # desde un dispositivo de la red el encabezado no cuenta (no viene de esta computadora)
    assert _login(c, "admin", "admin123", REMOTE_ADDR="192.168.1.30", **CF).status_code == 200
    # en la misma computadora, sin túnel, sí entra
    assert _login(app.test_client(), "admin", "admin123", **TUNNEL).status_code == 200


def test_tunnel_marks_cookie_secure(app, admin):
    admin.post("/api/auth/password", json={"current": "admin123", "new": "Tienda-2026"})
    r = _login(app.test_client(), "admin", "Tienda-2026", **TUNNEL, **CF)
    assert r.status_code == 200
    assert all("Secure" in v for v in r.headers.getlist("Set-Cookie"))
    assert "Strict-Transport-Security" in r.headers


def test_change_own_password(app, seller):
    r = seller.post("/api/auth/password", json={"current": "mala", "new": "Nueva-123"})
    assert r.status_code == 400 and r.get_json()["field"] == "current"
    r = seller.post("/api/auth/password", json={"current": "12345", "new": "123"})
    assert r.status_code == 400 and r.get_json()["field"] == "new"
    r = seller.post("/api/auth/password", json={"current": "12345", "new": "admin123"})
    assert r.status_code == 400 and r.get_json()["field"] == "new"
    assert seller.post("/api/auth/password", json={"current": "12345", "new": "Nueva-123"}).status_code == 200
    c = app.test_client()
    assert _login(c, "vendedor", "12345").status_code == 401
    assert _login(c, "vendedor", "Nueva-123").status_code == 200
    a = app.test_client()
    _login(a, "admin", "admin123")
    assert any(e["action"] == "Cambió su contraseña" for e in a.get("/api/audit").get_json()["entries"])
