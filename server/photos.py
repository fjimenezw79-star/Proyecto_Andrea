"""Validación y conversión de fotos de producto: WebP 1600 px + miniatura 400 px, sin EXIF."""
from __future__ import annotations

import uuid
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from .api_util import ValidationError

FORMATS = {"JPEG", "PNG", "WEBP", "MPO"}
FULL = 1600
THUMB = 400


def _bad() -> ValidationError:
    return ValidationError("El archivo no es una foto válida.", "photos")


def save_photo(file_storage, upload_dir: Path) -> tuple[str, str]:
    """Guarda la foto y su miniatura; devuelve (archivo, miniatura)."""
    upload_dir = Path(upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stream = file_storage.stream
    try:
        stream.seek(0)
        with Image.open(stream) as probe:
            if probe.format not in FORMATS:
                raise _bad()
            probe.verify()
        stream.seek(0)
        with Image.open(stream) as im:
            im = ImageOps.exif_transpose(im)
            mode = "RGBA" if im.mode in ("RGBA", "LA", "P") and "transparency" in im.info or im.mode == "RGBA" else "RGB"
            im = im.convert(mode)
            clean = Image.new(mode, im.size)  # copia sin metadatos (ubicación, datos del celular)
            clean.paste(im)
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
        raise _bad() from None
    name = uuid.uuid4().hex
    full, thumb = f"{name}.webp", f"{name}_t.webp"
    big = clean.copy()
    big.thumbnail((FULL, FULL))
    big.save(upload_dir / full, "WEBP", quality=82)
    small = clean.copy()
    small.thumbnail((THUMB, THUMB))
    small.save(upload_dir / thumb, "WEBP", quality=78)
    return full, thumb


def delete_files(upload_dir: Path, names: list[str]) -> None:
    for n in names:
        (Path(upload_dir) / n).unlink(missing_ok=True)
