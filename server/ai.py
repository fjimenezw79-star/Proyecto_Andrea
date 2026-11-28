"""Botón "✨ Buscar con IA": compara la foto del vendedor con hasta 8 candidatos usando Claude (con visión).

- Solo funciona con ``ANTHROPIC_API_KEY`` en ``.env``; el modelo se elige con ``ANTHROPIC_MODEL``.
- Cada consulta se registra (``ai_queries``) ANTES de llamar a la API: así dos dispositivos a la vez
  no pasan el límite del mes. Si la API falla, la consulta queda como ``error`` y no cuenta.
- La respuesta usa salida estructurada y solo puede elegir uno de los candidatos (o ninguno).
"""
from __future__ import annotations

import base64
import binascii
import io
import json
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from .api_util import ValidationError

MAX_CANDIDATES = 8
QUERY_PX = 1024
# Modelos que aceptan el respaldo automático del servidor si el primero declina la consulta
FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-fable-5-2"}

SYSTEM = (
    "Eres el asistente de una tienda de ropa, mochilas, termos y cobijas en México. "
    "El vendedor tomó una foto de un artículo que perdió su etiqueta. Compara la foto con las fotos de los "
    "candidatos del catálogo y di cuál es el mismo producto (mismo modelo, diseño, estampado y color). "
    "Si ninguno coincide con seguridad, responde 0. La razón va en español, en una frase corta."
)

SCHEMA = {
    "type": "object",
    "properties": {
        "candidate": {"type": "integer", "description": "Número del candidato que coincide; 0 si ninguno."},
        "reason": {"type": "string"},
    },
    "required": ["candidate", "reason"],
    "additionalProperties": False,
}


class AiUnavailable(Exception):
    """La API de IA no respondió (red, clave inválida, límite del proveedor)."""


def make_client(app):
    import anthropic

    return anthropic.Anthropic(api_key=app.config["ANTHROPIC_API_KEY"], timeout=45.0, max_retries=1)


def month_start(now: datetime | None = None) -> datetime:
    n = now or datetime.now()
    return n.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def clean_query_image(data_url) -> bytes:
    """Convierte la foto del vendedor (data URL) en JPEG de máximo 1024 px sin metadatos."""
    if not isinstance(data_url, str) or not data_url.startswith("data:image/") or ";base64," not in data_url:
        raise ValidationError("Falta la foto.", "image")
    try:
        raw = base64.b64decode(data_url.split(",", 1)[1], validate=True)
        with Image.open(io.BytesIO(raw)) as im:
            if im.format not in {"JPEG", "PNG", "WEBP", "MPO"}:
                raise ValidationError("La foto no es válida.", "image")
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((QUERY_PX, QUERY_PX))
            out = io.BytesIO()
            im.save(out, "JPEG", quality=85)
    except (binascii.Error, ValueError, UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValidationError("La foto no es válida.", "image") from None
    return out.getvalue()


def _variants_text(p) -> str:
    parts = [", ".join(f"{k}: {v}" for k, v in (v.attrs or {}).items()) for v in p.variants if v.active]
    parts = [x for x in parts if x]
    return f" ({'; '.join(parts)})" if parts else ""


def build_request(model: str, query_jpeg: bytes, products: list, upload_dir: Path) -> dict:
    content: list[dict] = [{"type": "text", "text": "Candidatos del catálogo:"}]
    for n, p in enumerate(products, 1):
        content.append({"type": "text", "text": f"Candidato {n}: {p.name}{_variants_text(p)}"})
        photo = p.photos[0] if p.photos else None
        path = Path(upload_dir) / photo.thumb_filename if photo else None
        if path and path.is_file():
            content.append({"type": "image", "source": {"type": "base64", "media_type": "image/webp",
                                                        "data": base64.b64encode(path.read_bytes()).decode()}})
    content.append({"type": "text", "text": "Foto que tomó el vendedor:"})
    content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                                "data": base64.b64encode(query_jpeg).decode()}})
    content.append({"type": "text", "text": f"¿Cuál de los {len(products)} candidatos es? Responde con su número o 0."})
    req = {
        "model": model,
        "max_tokens": 4000,
        "system": SYSTEM,
        "messages": [{"role": "user", "content": content}],
        "output_config": {"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
    }
    if model in FALLBACK_MODELS:
        req["betas"] = ["server-side-fallback-2026-07-01"]
        req["fallbacks"] = "default"
    return req


def ask(app, query_jpeg: bytes, products: list) -> tuple[int | None, str, int, int]:
    """Devuelve (índice 0-based del candidato o None, razón, tokens de entrada, tokens de salida)."""
    import anthropic

    req = build_request(app.config["ANTHROPIC_MODEL"], query_jpeg, products, app.config["UPLOAD_DIR"])
    try:
        resp = make_client(app).beta.messages.create(**req)
    except (anthropic.APIError, AiUnavailable) as e:
        app.logger.warning("La IA no respondió: %s", e)
        raise AiUnavailable(str(e)) from None
    usage = getattr(resp, "usage", None)
    tin, tout = int(getattr(usage, "input_tokens", 0) or 0), int(getattr(usage, "output_tokens", 0) or 0)
    if resp.stop_reason == "refusal":
        return None, "La IA no pudo revisar esta foto.", tin, tout
    text = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), "")
    try:
        data = json.loads(text)
        n = int(data["candidate"])
        reason = str(data.get("reason", ""))[:300]
    except (ValueError, KeyError, TypeError):
        return None, "La IA no dio una respuesta clara.", tin, tout
    if not 1 <= n <= len(products):
        return None, reason or "Ninguno de los candidatos coincide.", tin, tout
    return n - 1, reason, tin, tout
