def test_root_serves_app(client):
    r = client.get("/")
    assert r.status_code == 200 and b'<div id="root">' in r.data
    assert r.headers["Cache-Control"] == "no-cache"


def test_deep_link_serves_app(client):
    assert b'<div id="root">' in client.get("/inventario/12").data


def test_api_404_stays_json(client):
    assert client.get("/api/nada").get_json()["ok"] is False


def test_assets_cached_long(client):
    import pathlib

    import server

    assets = pathlib.Path(server.__file__).parent / "web_dist" / "assets"
    name = next(assets.glob("*.js")).name
    r = client.get(f"/assets/{name}")
    assert r.status_code == 200 and "max-age=31536000" in r.headers["Cache-Control"]


def test_bare_api_is_404(client):
    assert client.get("/api").status_code == 404
