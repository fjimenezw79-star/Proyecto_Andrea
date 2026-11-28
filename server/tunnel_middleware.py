"""Reconoce las visitas que llegan por el túnel de Cloudflare (adaptado de AcuaGest DEMO 3.0).

cloudflared se conecta desde la misma computadora (127.0.0.1) y agrega ``Cf-Connecting-Ip`` con la IP real del
visitante. Solo se confía en ese encabezado cuando la conexión viene de esta computadora, así nadie en la red
local puede falsificarlo. Por internet la conexión es HTTPS: las cookies se marcan ``Secure``.
"""
from __future__ import annotations

from flask import request

LOCAL_ADDRS = {"127.0.0.1", "::1"}
HSTS_SECONDS = 60 * 60 * 24 * 365
FLAG = "modasandrea.via_internet"


class CloudflareTunnelMiddleware:
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        real_ip = environ.get("HTTP_CF_CONNECTING_IP")
        if not (real_ip and environ.get("REMOTE_ADDR") in LOCAL_ADDRS):
            return self.wsgi_app(environ, start_response)
        environ[FLAG] = True
        environ["REMOTE_ADDR"] = real_ip.strip()
        environ["wsgi.url_scheme"] = "https"

        def secure_start_response(status, headers, exc_info=None):
            fixed = []
            for name, value in headers:
                if name.lower() == "set-cookie" and "; secure" not in value.lower():
                    value += "; Secure"
                fixed.append((name, value))
            fixed.append(("Strict-Transport-Security", f"max-age={HSTS_SECONDS}"))
            return start_response(status, fixed, exc_info)

        return self.wsgi_app(environ, secure_start_response)


def via_internet() -> bool:
    return bool(request.environ.get(FLAG))
