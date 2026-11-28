"""Configuración central de Modas Andrea.

Los valores propios de cada instalación se leen de ``.env`` (ver ``.env.example``).
Adaptado de AcuaGest DEMO 3.0 (clave secreta persistente).
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _secret_key() -> str:
    """Clave para firmar sesiones: la de ``.env`` o una que se guarda una sola vez en ``data/.secret_key``."""
    key = os.environ.get("SECRET_KEY", "").strip()
    if key:
        return key
    path = BASE_DIR / "data" / ".secret_key"
    try:
        if path.exists():
            saved = path.read_text(encoding="utf-8").strip()
            if len(saved) >= 32:
                return saved
        path.parent.mkdir(parents=True, exist_ok=True)
        key = secrets.token_hex(32)
        path.write_text(key, encoding="utf-8")
        return key
    except OSError:  # carpeta de solo lectura
        return secrets.token_hex(32)


class Config:
    APP_NAME = "Modas Andrea"
    APP_VERSION = "0.1.0"
    SECRET_KEY = _secret_key()
    DATA_DIR = str(BASE_DIR / "data")
    DATABASE = str(BASE_DIR / "data" / "modas-andrea.db")
    UPLOAD_DIR = str(BASE_DIR / "data" / "fotos")
    BACKUP_DIR = str(BASE_DIR / "data" / "respaldos")
    BACKUPS_TO_KEEP = _int("BACKUPS_TO_KEEP", 15)
    HOST = os.environ.get("HOST", "0.0.0.0")
    PORT = _int("PORT", 5000)
    SELLER_MAX_DISCOUNT_PCT = _int("SELLER_MAX_DISCOUNT_PCT", 10)
    POINTS_PER_PESOS = _int("POINTS_PER_PESOS", 10)
    LAYAWAY_DAYS = _int("LAYAWAY_DAYS", 30)
    LOW_STOCK_THRESHOLD = 2
    # Acceso desde internet (Cloudflare Tunnel): ver acceso_remoto.bat
    PUBLIC_URL = os.environ.get("PUBLIC_URL", "").strip()
    CLOUDFLARE_TUNNEL_TOKEN = os.environ.get("CLOUDFLARE_TUNNEL_TOKEN", "").strip()
    BLOCK_DEFAULT_PASSWORDS_REMOTE = os.environ.get("BLOCK_DEFAULT_PASSWORDS_REMOTE", "true").strip().lower() not in ("0", "false", "no")
    TOOLS_DIR = str(BASE_DIR / "tools")
    MAX_CONTENT_LENGTH = 25 * 1024 * 1024
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    WTF_CSRF_ENABLED = True
    WTF_CSRF_TIME_LIMIT = None
    TESTING = False


class TestConfig(Config):
    TESTING = True
    WTF_CSRF_ENABLED = False
    SECRET_KEY = "pruebas"
