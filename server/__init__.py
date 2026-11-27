"""Fábrica de la aplicación Modas Andrea."""
from __future__ import annotations

from flask import Flask, jsonify, request
from flask_wtf.csrf import CSRFError, CSRFProtect

from .api_util import ConflictError, ValidationError, fail, ok
from .config import Config

csrf = CSRFProtect()


def create_app(config_class: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)
    csrf.init_app(app)

    from . import db
    db.init_app(app)
    db.upgrade(app)

    from . import security
    security.init_app(app)

    from .blueprints import auth, catalog, inventory, sales, settings
    for module in (auth, settings, catalog, inventory, sales):
        app.register_blueprint(module.bp)
    app.register_blueprint(catalog.uploads)

    @app.get("/api/health")
    def health():
        return ok(app=app.config["APP_NAME"])

    @app.after_request
    def security_headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "same-origin")
        resp.headers.setdefault("Permissions-Policy", "geolocation=(), camera=(self), microphone=()")
        resp.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        return resp

    def wants_json() -> bool:
        return request.path.startswith("/api/")

    @app.errorhandler(ValidationError)
    def validation_error(e: ValidationError):
        return fail(e.message, 400, e.field)

    @app.errorhandler(ConflictError)
    def conflict_error(e: ConflictError):
        return fail(e.message, 409, None, **e.data)

    @app.errorhandler(CSRFError)
    def csrf_error(_e):
        return fail("La sesión de seguridad expiró. Recarga la página e inténtalo de nuevo.", 400)

    @app.errorhandler(413)
    def too_large(_e):
        return fail("El envío es demasiado grande. Cada foto debe pesar menos de 25 MB.", 413)

    @app.errorhandler(404)
    def not_found(_e):
        if wants_json():
            return fail("Recurso no encontrado.", 404)
        return jsonify(ok=False, message="Página no encontrada."), 404

    @app.errorhandler(405)
    def not_allowed(_e):
        return fail("Método no permitido.", 405)

    @app.errorhandler(500)
    def server_error(e):
        app.logger.exception("Error interno: %s", e)
        return fail("Ocurrió un error inesperado. Ya quedó registrado; inténtalo de nuevo.", 500)

    return app
