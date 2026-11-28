"""Acceso desde internet con Cloudflare Tunnel (copiado de AcuaGest DEMO 3.0).

Dos modos:

* **Prueba rápida** (sin cuenta): ``cloudflared tunnel --url http://127.0.0.1:PUERTO``.
  Cloudflare entrega una dirección temporal ``https://algo.trycloudflare.com`` que
  cambia en cada arranque.
* **Permanente** (con cuenta y dominio): se usa ``CLOUDFLARE_TUNNEL_TOKEN`` del
  archivo ``.env`` y la dirección fija indicada en ``PUBLIC_URL``.

La computadora sigue ejecutando Modas Andrea; Cloudflare solo reenvía las visitas
cifradas (HTTPS) hasta ella. No hace falta abrir puertos en el módem.
"""
from __future__ import annotations

import logging
import os
import platform
import re
import shutil
import subprocess
import threading
import time
import urllib.request
from pathlib import Path

log = logging.getLogger(__name__)

DOWNLOADS = {
    ("Windows", "AMD64"): "cloudflared-windows-amd64.exe",
    ("Windows", "x86"): "cloudflared-windows-386.exe",
    ("Windows", "ARM64"): "cloudflared-windows-amd64.exe",
    ("Linux", "x86_64"): "cloudflared-linux-amd64",
    ("Linux", "aarch64"): "cloudflared-linux-arm64",
    ("Darwin", "x86_64"): None,
    ("Darwin", "arm64"): None,
}
RELEASE_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/{name}"
QUICK_URL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")


class TunnelError(RuntimeError):
    pass


def binary_path(tools_dir: Path) -> Path:
    exe = "cloudflared.exe" if platform.system() == "Windows" else "cloudflared"
    return tools_dir / exe


def find_or_download(tools_dir: Path) -> Path:
    """Devuelve la ruta de cloudflared; lo descarga la primera vez (≈ 50 MB)."""
    local = binary_path(tools_dir)
    if local.exists():
        return local
    on_path = shutil.which("cloudflared")
    if on_path:
        return Path(on_path)
    name = DOWNLOADS.get((platform.system(), platform.machine()))
    if not name:
        raise TunnelError(
            "No hay descarga automática para este sistema. Instala cloudflared desde "
            "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
        )
    tools_dir.mkdir(parents=True, exist_ok=True)
    tmp = local.with_suffix(".descargando")
    print("  Descargando la herramienta de Cloudflare (solo la primera vez, ~50 MB)...", flush=True)
    try:
        urllib.request.urlretrieve(RELEASE_URL.format(name=name), tmp)
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        raise TunnelError(f"No se pudo descargar cloudflared: {exc}. Revisa tu conexión a internet.") from exc
    tmp.replace(local)
    if platform.system() != "Windows":
        local.chmod(0o755)
    return local


class Tunnel:
    """Ejecuta cloudflared en segundo plano y expone la dirección pública."""

    def __init__(self, binary: Path, port: int, token: str = "", fixed_url: str = ""):
        self.binary = binary
        self.port = port
        self.token = token.strip()
        self.fixed_url = fixed_url.strip().rstrip("/")
        self.url: str | None = self.fixed_url or None
        self.mode = "permanente" if self.token else "prueba"
        self.connected = threading.Event()
        self.process: subprocess.Popen | None = None
        self.last_lines: list[str] = []

    def command(self) -> list[str]:
        base = [str(self.binary), "tunnel", "--no-autoupdate"]
        if self.token:
            return base + ["run", "--token", self.token]
        return base + ["--url", f"http://127.0.0.1:{self.port}"]

    def handle_line(self, line: str) -> None:
        """Procesa una línea del registro de cloudflared (se prueba de forma aislada)."""
        line = line.strip()
        if not line:
            return
        self.last_lines = (self.last_lines + [line])[-15:]
        if not self.token:
            m = QUICK_URL_RE.search(line)
            if m and "api.trycloudflare.com" not in m.group(0):
                self.url = m.group(0)
        if "Registered tunnel connection" in line or "Connection registered" in line:
            self.connected.set()

    def start(self) -> None:
        flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        self.process = subprocess.Popen(
            self.command(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", creationflags=flags,
        )
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self) -> None:
        assert self.process and self.process.stdout
        for line in self.process.stdout:
            self.handle_line(line)
        log.warning("cloudflared se detuvo. Últimas líneas:\n%s", "\n".join(self.last_lines[-5:]))

    def wait_ready(self, timeout: float = 45) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.process and self.process.poll() is not None:
                return False
            if self.url and self.connected.is_set():
                return True
            time.sleep(0.3)
        return bool(self.url)

    @property
    def alive(self) -> bool:
        return bool(self.process and self.process.poll() is None)

    def stop(self) -> None:
        if self.alive:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
