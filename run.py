"""Punto de entrada de Modas Andrea.

    python run.py              -> servidor para esta computadora y la red local (Waitress)
    python run.py --dev        -> servidor de desarrollo con mensajes de depuración
    python run.py --no-browser -> no abre el navegador
"""
from __future__ import annotations

import argparse
import logging
import socket
import sys
import threading
import webbrowser


def local_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))  # no envía datos: solo elige la interfaz de red
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Servidor de Modas Andrea")
    parser.add_argument("--dev", action="store_true", help="modo desarrollo")
    parser.add_argument("--no-browser", action="store_true", help="no abrir el navegador")
    args = parser.parse_args()

    from server import create_app
    from server.db import backup_database

    app = create_app()
    host, port = app.config["HOST"], app.config["PORT"]
    if port_in_use(port):
        print(f"\n  [!] El puerto {port} ya está en uso: probablemente Modas Andrea ya está abierto en otra ventana.\n"
              "      Ciérrala, o cambia PORT en el archivo .env.\n", flush=True)
        sys.exit(1)
    backup_database(app)

    url = f"http://127.0.0.1:{port}"
    print("\n".join([
        "",
        "  ==============================================================",
        f"   {app.config['APP_NAME']} {app.config['APP_VERSION']} en funcionamiento",
        "  ==============================================================",
        f"   En esta computadora : {url}",
        f"   En la red local     : http://{local_ip()}:{port}",
        "   Para detener el servidor cierra esta ventana o presiona Ctrl+C",
        "",
    ]), flush=True)

    if not args.no_browser:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    if args.dev:
        app.run(host=host, port=port, debug=True, use_reloader=False)
    else:
        from waitress import serve

        logging.getLogger("waitress").setLevel(logging.WARNING)
        serve(app, host=host, port=port, threads=8, ident="ModasAndrea")


if __name__ == "__main__":
    main()
