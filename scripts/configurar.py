"""Crea ``.env`` a partir de ``.env.example`` con una clave secreta aleatoria (lo usa instalar.bat)."""
from __future__ import annotations

import re
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(root: Path = ROOT) -> bool:
    env = root / ".env"
    if env.exists() and re.search(r"^SECRET_KEY=\S+", env.read_text(encoding="utf-8"), re.M):
        return False
    text = (root / ".env.example").read_text(encoding="utf-8")
    text = re.sub(r"^SECRET_KEY=.*$", f"SECRET_KEY={secrets.token_hex(32)}", text, flags=re.M)
    env.write_text(text, encoding="utf-8")
    return True


if __name__ == "__main__":  # pragma: no cover
    print("Archivo .env creado." if run() else "El archivo .env ya existía; no se cambió.")
