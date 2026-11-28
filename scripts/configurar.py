"""Prepara ``.env`` (lo usan instalar.bat y actualizar.bat).

- Si no existe, lo crea a partir de ``.env.example`` con una clave secreta aleatoria.
- Si ya existe (por ejemplo, copiado de la instalación anterior), conserva todos sus valores, le pone clave
  secreta si no tenía y agrega al final las opciones nuevas de esta versión que le falten, vacías o con su valor
  de fábrica, junto con su explicación.
"""
from __future__ import annotations

import re
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEY_RE = re.compile(r"^([A-Z][A-Z0-9_]*)=", re.M)


def _blocks(example: str) -> list[tuple[str, list[str]]]:
    """Cada variable de .env.example con los comentarios que la explican."""
    out, comments = [], []
    for line in example.splitlines():
        m = KEY_RE.match(line)
        if m:
            out.append((m.group(1), comments + [line]))
            comments = []
        elif line.startswith("#"):
            comments.append(line)
        else:
            comments = []
    return out


def run(root: Path = ROOT) -> bool:
    """Devuelve True si creó o cambió ``.env``."""
    env, example = root / ".env", (root / ".env.example").read_text(encoding="utf-8")
    line = f"SECRET_KEY={secrets.token_hex(32)}"
    if not env.exists():
        env.write_text(re.sub(r"^SECRET_KEY=.*$", line, example, flags=re.M), encoding="utf-8")
        return True
    text = original = env.read_text(encoding="utf-8")
    if not re.search(r"^SECRET_KEY=\S+", text, re.M):
        if re.search(r"^SECRET_KEY=.*$", text, re.M):
            text = re.sub(r"^SECRET_KEY=.*$", line, text, flags=re.M)
        else:
            text = text.rstrip("\n") + "\n" + line + "\n"
    have = set(KEY_RE.findall(text))
    missing = [lines for key, lines in _blocks(example) if key not in have and key != "SECRET_KEY"]
    if missing:
        text = text.rstrip("\n") + "\n\n# ---------- Opciones nuevas de esta versión ----------\n"
        text += "\n".join("\n".join(lines) for lines in missing) + "\n"
    if text == original:
        return False
    env.write_text(text, encoding="utf-8")
    return True


if __name__ == "__main__":  # pragma: no cover
    print("Archivo .env listo." if run() else "El archivo .env ya estaba al día; no se cambió.")
