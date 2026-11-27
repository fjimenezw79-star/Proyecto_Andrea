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
