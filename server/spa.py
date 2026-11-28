"""Sirve la app compilada (server/web_dist): archivos tal cual y cualquier ruta de la app → index.html."""
from __future__ import annotations

import mimetypes
from pathlib import Path

from flask import Blueprint, abort, send_from_directory

# En Windows el registro a veces no conoce .wasm: sin este tipo el navegador carga el reconocimiento más lento
mimetypes.add_type("application/wasm", ".wasm")

DIST = Path(__file__).resolve().parent / "web_dist"
ONE_YEAR = 365 * 24 * 3600
NO_CACHE = {"sw.js", "manifest.webmanifest"}

bp = Blueprint("spa", __name__)


def _index():
    if not (DIST / "index.html").exists():
        abort(404)
    resp = send_from_directory(DIST, "index.html", max_age=0)
    resp.headers["Cache-Control"] = "no-cache"
    return resp


@bp.get("/")
def index():
    return _index()


@bp.get("/<path:path>")
def app_route(path: str):
    if path in ("api", "uploads") or path.startswith(("api/", "uploads/")):
        abort(404)
    target = (DIST / path).resolve()
    if DIST in target.parents and target.is_file():
        max_age = ONE_YEAR if path.startswith("assets/") else 0 if path in NO_CACHE else 3600
        resp = send_from_directory(DIST, path, max_age=max_age)
        if path in NO_CACHE:
            resp.headers["Cache-Control"] = "no-cache"
        if max_age == ONE_YEAR:
            resp.headers["Cache-Control"] = f"public, max-age={ONE_YEAR}, immutable"
        return resp
    return _index()
