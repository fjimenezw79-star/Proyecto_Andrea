def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.get_json() == {"ok": True, "message": "", "app": "Modas Andrea"}


def test_security_headers(client):
    r = client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"


def test_unknown_api_route_is_json_404(client):
    r = client.get("/api/no-existe")
    assert r.status_code == 404
    assert r.get_json()["ok"] is False


def test_validation_error_becomes_400(app, client):
    from server.api_util import ValidationError

    @app.get("/api/_boom")
    def boom():
        raise ValidationError("El precio es obligatorio.", field="price")

    r = client.get("/api/_boom")
    assert r.status_code == 400
    assert r.get_json() == {"ok": False, "message": "El precio es obligatorio.", "field": "price"}
