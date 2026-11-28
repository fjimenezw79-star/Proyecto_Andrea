"""Etapa 5: botón "Buscar con IA". Nunca llama a la API real: se usa un cliente falso."""
import base64
import io
import json
import threading
from types import SimpleNamespace

import pytest

from server import ai
from server.db import session
from server.models import AiQuery
from tests.conftest import make_jpeg, post_product


def data_url() -> str:
    return "data:image/jpeg;base64," + base64.b64encode(make_jpeg().getvalue()).decode()


class FakeClient:
    """Imita client.beta.messages.create y guarda lo que recibió."""

    def __init__(self, answer=None, error: Exception | None = None, stop_reason="end_turn", gate=None):
        self.answer, self.error, self.stop_reason, self.gate = answer, error, stop_reason, gate
        self.calls: list[dict] = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self.create))

    def create(self, **kw):
        self.calls.append(kw)
        if self.gate:
            self.gate.wait(5)
        if self.error:
            raise self.error
        text = self.answer if isinstance(self.answer, str) else json.dumps(self.answer)
        return SimpleNamespace(stop_reason=self.stop_reason, content=[SimpleNamespace(type="text", text=text)],
                               usage=SimpleNamespace(input_tokens=3000, output_tokens=120))


@pytest.fixture()
def enabled(app, monkeypatch):
    app.config["ANTHROPIC_API_KEY"] = "sk-prueba"
    app.config["ANTHROPIC_MODEL"] = "claude-opus-5-5"

    def use(client):
        monkeypatch.setattr(ai, "make_client", lambda _app: client)
        return client
    return use


@pytest.fixture()
def products(admin, cat_id):
    out = []
    for name in ("Termo rosa", "Termo azul", "Cobija"):
        r = post_product(admin, {"name": name, "category_id": cat_id, "price_cents": 20000}, [(make_jpeg(), "a.jpg")])
        out.append(r.get_json()["product"]["id"])
    return out


def test_status_without_key(seller):
    s = seller.get("/api/vision/ai").get_json()
    assert s["enabled"] is False and s["used"] == 0 and s["limit"] == 100


def test_post_without_key_is_503(seller, products):
    r = seller.post("/api/vision/ai", json={"image": data_url(), "candidates": products})
    assert r.status_code == 503


def test_match_returns_candidate_and_counts(app, seller, products, enabled):
    fake = enabled(FakeClient({"candidate": 2, "reason": "Mismo color y tapa."}))
    r = seller.post("/api/vision/ai", json={"image": data_url(), "candidates": products})
    assert r.status_code == 200, r.get_json()
    assert r.get_json()["match"] == products[1]
    assert r.get_json()["reason"] == "Mismo color y tapa."
    call = fake.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["output_config"]["format"]["type"] == "json_schema"
    images = [b for b in call["messages"][0]["content"] if b["type"] == "image"]
    assert len(images) == 4  # 3 candidatos + la foto del vendedor
    assert images[-1]["source"]["media_type"] == "image/jpeg"
    s = seller.get("/api/vision/ai").get_json()
    assert s["enabled"] is True and s["used"] == 1
    with app.app_context():
        q = session.query(AiQuery).one()
        assert (q.status, q.matched_product_id, q.input_tokens) == ("ok", products[1], 3000)


@pytest.mark.parametrize("answer", [{"candidate": 0, "reason": "Ninguno"}, {"candidate": 9, "reason": "x"},
                                    "esto no es json", {"reason": "sin campo"}],
                         ids=["ninguno", "fuera-de-rango", "texto", "sin-candidato"])
def test_no_or_invalid_answer_is_no_match(seller, products, enabled, answer):
    enabled(FakeClient(answer))
    r = seller.post("/api/vision/ai", json={"image": data_url(), "candidates": products})
    assert r.status_code == 200
    assert r.get_json()["match"] is None


def test_refusal_is_no_match(seller, products, enabled):
    enabled(FakeClient({"candidate": 1, "reason": ""}, stop_reason="refusal"))
    assert seller.post("/api/vision/ai", json={"image": data_url(), "candidates": products}).get_json()["match"] is None


def test_api_error_is_502_and_not_counted(app, seller, products, enabled):
    enabled(FakeClient(error=ai.AiUnavailable("caída")))
    r = seller.post("/api/vision/ai", json={"image": data_url(), "candidates": products})
    assert r.status_code == 502
    assert seller.get("/api/vision/ai").get_json()["used"] == 0


def test_monthly_limit(app, admin, seller, products, enabled):
    enabled(FakeClient({"candidate": 1, "reason": "ok"}))
    admin.put("/api/settings", json={"ai_monthly_limit": 1})
    assert seller.post("/api/vision/ai", json={"image": data_url(), "candidates": products}).status_code == 200
    r = seller.post("/api/vision/ai", json={"image": data_url(), "candidates": products})
    assert r.status_code == 429
    assert seller.get("/api/vision/ai").get_json()["enabled"] is False
    admin.put("/api/settings", json={"ai_monthly_limit": 0})
    assert seller.post("/api/vision/ai", json={"image": data_url(), "candidates": products}).status_code == 429


def test_limit_holds_with_two_requests_at_once(app, admin, products, enabled, tmp_path):
    """Dos dispositivos a la vez con un solo lugar libre: solo uno llama a la API."""
    gate = threading.Event()
    fake = enabled(FakeClient({"candidate": 1, "reason": "ok"}, gate=gate))
    admin.put("/api/settings", json={"ai_monthly_limit": 1})
    from tests.conftest import login
    results = []

    def go():
        c = login(app.test_client(), "vendedor", "12345")
        results.append(c.post("/api/vision/ai", json={"image": data_url(), "candidates": products}).status_code)
    threads = [threading.Thread(target=go) for _ in range(2)]
    for t in threads:
        t.start()
    threads[0].join(1)
    gate.set()
    for t in threads:
        t.join(10)
    assert sorted(results) == [200, 429]
    assert len(fake.calls) == 1


@pytest.mark.parametrize("body", [
    {"image": "data:image/jpeg;base64,AAAA", "candidates": [1]},
    {"image": "no es imagen", "candidates": [1]},
    {"candidates": [1]},
    {"image": "IMG", "candidates": []},
    {"image": "IMG", "candidates": list(range(1, 11))},
    {"image": "IMG", "candidates": [99999]},
], ids=["imagen-rota", "sin-data-url", "sin-imagen", "sin-candidatos", "demasiados", "producto-inexistente"])
def test_bad_requests(seller, products, enabled, body):
    enabled(FakeClient({"candidate": 1, "reason": ""}))
    if body.get("image") == "IMG":
        body = {**body, "image": data_url()}
    assert seller.post("/api/vision/ai", json=body).status_code == 400


def test_query_image_is_resized_and_clean(seller, products, enabled):
    from PIL import Image
    fake = enabled(FakeClient({"candidate": 1, "reason": ""}))
    buf = io.BytesIO()
    Image.new("RGB", (3000, 2000), (10, 200, 30)).save(buf, "PNG")
    url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    assert seller.post("/api/vision/ai", json={"image": url, "candidates": products}).status_code == 200
    src = [b for b in fake.calls[0]["messages"][0]["content"] if b["type"] == "image"][-1]["source"]
    with Image.open(io.BytesIO(base64.b64decode(src["data"]))) as im:
        assert max(im.size) == 1024 and im.format == "JPEG"
