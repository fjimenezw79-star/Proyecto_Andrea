"""Punto de entrada de Modas Andrea.

    python run.py              -> servidor para esta computadora y la red local (Waitress)
    python run.py --dev        -> servidor de desarrollo con mensajes de depuración
    python run.py --internet   -> además crea un túnel seguro de Cloudflare (acceso desde internet, HTTPS)
    python run.py --no-browser -> no abre el navegador
"""
from __future__ import annotations

import argparse
import logging
import socket
import sys
import threading
import webbrowser
from pathlib import Path


def start_tunnel(app):
    """Inicia cloudflared y devuelve el objeto Tunnel (o None si falló). Igual que AcuaGest DEMO 3.0."""
    from server.tunnel import Tunnel, TunnelError, find_or_download

    cfg = app.config
    try:
        binary = find_or_download(Path(cfg["TOOLS_DIR"]))
    except TunnelError as exc:
        print(f"\n  [!] {exc}\n", flush=True)
        return None
    if cfg["CLOUDFLARE_TUNNEL_TOKEN"] and not cfg["PUBLIC_URL"]:
        print("  [!] Tienes CLOUDFLARE_TUNNEL_TOKEN pero falta PUBLIC_URL en .env "
              "(la dirección fija, p. ej. https://ventas.modasandrea.com).", flush=True)
    tunnel = Tunnel(binary, cfg["PORT"], cfg["CLOUDFLARE_TUNNEL_TOKEN"], cfg["PUBLIC_URL"])
    print("  Conectando con Cloudflare...", flush=True)
    tunnel.start()
    if not tunnel.wait_ready(60):
        print("\n  [!] No se pudo crear el túnel de Cloudflare. Últimos mensajes:", flush=True)
        for line in tunnel.last_lines[-6:]:
            print("      " + line, flush=True)
        print("      Modas Andrea sigue funcionando en esta computadora y en la red local.\n", flush=True)
        tunnel.stop()
        return None
    app.extensions["tunnel"] = tunnel
    return tunnel


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Servidor de Modas Andrea")
    parser.add_argument("--dev", action="store_true", help="modo desarrollo")
    parser.add_argument("--internet", action="store_true", help="acceso desde internet con Cloudflare Tunnel")
    parser.add_argument("--no-browser", action="store_true", help="no abrir el navegador")
    args = parser.parse_args()

    from server import create_app
    from server.db import backup_database
    from server.netinfo import local_ip

    app = create_app()
    host, port = app.config["HOST"], app.config["PORT"]
    if port_in_use(port):
        print(f"\n  [!] El puerto {port} ya está en uso: probablemente Modas Andrea ya está abierto en otra ventana.\n"
              "      Ciérrala, o cambia PORT en el archivo .env.\n", flush=True)
        sys.exit(1)
    backup_database(app)

    url = f"http://127.0.0.1:{port}"
    lines = [
        "",
        "  ==============================================================",
        f"   {app.config['APP_NAME']} {app.config['APP_VERSION']} en funcionamiento",
        "  ==============================================================",
        f"   En esta computadora : {url}",
        f"   En la red local     : http://{local_ip()}:{port}",
    ]
    tunnel = start_tunnel(app) if args.internet else None
    if tunnel:
        lines += [
            "  --------------------------------------------------------------",
            f"   DESDE INTERNET      : {tunnel.url}",
            f"   Modo                : {'permanente (dirección fija)' if tunnel.mode == 'permanente' else 'prueba (la dirección cambia en cada inicio)'}",
            "   Conecta celulares y tablets desde Conectar dispositivo (código QR).",
            "   La conexión es segura (HTTPS) y la app funciona aunque se vaya la señal.",
        ]
    lines += ["   Para detener el servidor cierra esta ventana o presiona Ctrl+C", ""]
    print("\n".join(lines), flush=True)

    if not args.no_browser:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    try:
        if args.dev:
            app.run(host=host, port=port, debug=True, use_reloader=False)
        else:
            from waitress import serve

            logging.getLogger("waitress").setLevel(logging.WARNING)
            serve(app, host=host, port=port, threads=8, ident="ModasAndrea")
    finally:
        if tunnel:
            tunnel.stop()


if __name__ == "__main__":
    main()
