"""Ayuda para pasar archivos del disco a las funciones que esperan fotos subidas."""
from __future__ import annotations

from pathlib import Path

from werkzeug.datastructures import FileStorage


def file_storage(path: Path) -> FileStorage:
    return FileStorage(stream=open(path, "rb"), filename=path.name)  # noqa: SIM115 (se cierra en close_all)


def close_all(files: list[FileStorage]) -> None:
    for f in files:
        f.stream.close()
