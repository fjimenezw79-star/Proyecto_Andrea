"""Respuestas JSON uniformes y errores de validación."""
from __future__ import annotations

from flask import jsonify


class ValidationError(ValueError):
    def __init__(self, message: str, field: str | None = None):
        super().__init__(message)
        self.message = message
        self.field = field


class ConflictError(ValueError):
    """Error de negocio que responde 409 (código repetido, sin stock, ya cancelada…)."""

    def __init__(self, message: str, **data):
        super().__init__(message)
        self.message = message
        self.data = data


def ok(message: str = "", status: int = 200, **data):
    return jsonify(ok=True, message=message, **data), status


def fail(message: str, status: int = 400, field: str | None = None, **data):
    return jsonify(ok=False, message=message, field=field, **data), status


MAX_MONEY = 10**12


def strict_int(value, field: str, minimum: int | None = None, maximum: int = MAX_MONEY) -> int:
    """Entero exacto: rechaza decimales (199.99), booleanos y texto no numérico."""
    if isinstance(value, bool) or value is None:
        raise ValidationError("Escribe un número entero.", field)
    if isinstance(value, int):
        n = value
    elif isinstance(value, str) and value.strip().lstrip("-").isdigit():
        n = int(value.strip())
    else:
        raise ValidationError("Escribe un número entero, sin decimales.", field)
    if minimum is not None and n < minimum:
        raise ValidationError("La cantidad no es válida.", field)
    if n > maximum:
        raise ValidationError("La cantidad es demasiado grande.", field)
    return n
