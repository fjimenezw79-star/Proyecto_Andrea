"""Servidor para pruebas de punta a punta: base temporal con el catálogo de prueba, puerto 5055.

    python -m scripts.e2e_server
"""
from __future__ import annotations

import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def build_app(tmp: Path):
    from server import create_app
    from server.config import Config

    class E2EConfig(Config):
        DATABASE = str(tmp / "e2e.db")
        UPLOAD_DIR = str(tmp / "fotos")
        BACKUP_DIR = str(tmp / "respaldos")
        SECRET_KEY = "e2e"
        STORE_ORDER_LIMIT = 1000

    app = create_app(E2EConfig)
    from scripts.importar_datos_prueba import run

    run(app, ROOT / "datos_prueba")
    return app


if __name__ == "__main__":  # pragma: no cover
    from waitress import serve

    with tempfile.TemporaryDirectory(prefix="modas-e2e-") as d:
        serve(build_app(Path(d)), host="127.0.0.1", port=5055, threads=8)
