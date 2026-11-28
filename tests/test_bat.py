"""Revisión de los .bat de Windows (aquí no se pueden ejecutar): formato y pasos clave."""
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BATS = ["instalar.bat", "actualizar.bat", "aplicacion.bat", "acceso_remoto.bat", "restablecer_contrasena.bat"]


@pytest.mark.parametrize("name", BATS)
def test_bat_uses_windows_line_endings(name):
    data = (ROOT / name).read_bytes()
    assert b"\r\n" in data and data.count(b"\n") == data.count(b"\r\n"), f"{name} debe tener fin de línea CRLF"


def test_installer_creates_both_shortcuts():
    s = (ROOT / "instalar.bat").read_text(encoding="utf-8")
    assert "'Modas Andrea.lnk'" in s and "%~dp0aplicacion.bat" in s
    assert "'Modas Andrea (internet).lnk'" in s and "%~dp0acceso_remoto.bat" in s


def test_installer_update_mode_skips_test_data():
    s = (ROOT / "instalar.bat").read_text(encoding="utf-8")
    assert 'if /i "%~1"=="/actualizar" set "UPDATE=1"' in s
    i = s.index("scripts.importar_datos_prueba")
    assert "if not defined UPDATE (" in s[s.rindex("\n", 0, i - 200):i]


def test_updater_finds_old_install_copies_data_and_backs_up():
    s = (ROOT / "actualizar.bat").read_text(encoding="utf-8")
    assert "'Modas Andrea.lnk','Modas Andrea (internet).lnk'" in s
    assert 'robocopy "!OLD!\\data" "!NEW!\\data"' in s and 'copy /y "!OLD!\\.env" "!NEW!\\.env"' in s
    assert s.index("antes_de_actualizar_") < s.index('call "!NEW!\\instalar.bat" /actualizar')
