"""Dirección de esta computadora en la red local."""
from __future__ import annotations

import socket


def local_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))  # no envía datos: solo elige la interfaz de red
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
