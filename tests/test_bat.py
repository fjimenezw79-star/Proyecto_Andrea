"""Revisión de los .bat de Windows (aquí no se pueden ejecutar): formato y pasos clave."""
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BATS = ["instalar.bat", "actualizar.bat", "crear_accesos_directos.bat", "aplicacion.bat", "acceso_remoto.bat", "restablecer_contrasena.bat"]


@pytest.mark.parametrize("name", BATS)
def test_bat_uses_windows_line_endings(name):
    data = (ROOT / name).read_bytes()
    assert b"\r\n" in data and data.count(b"\n") == data.count(b"\r\n"), f"{name} debe tener fin de línea CRLF"


def test_installer_creates_both_shortcuts():
    cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\\accesos_directos.ps1" "%~dp0."'
    assert cmd in (ROOT / "instalar.bat").read_text(encoding="utf-8")
    assert cmd in (ROOT / "crear_accesos_directos.bat").read_text(encoding="utf-8")
    ps = (ROOT / "scripts" / "accesos_directos.ps1").read_bytes()
    assert ps.isascii() and b"\r\n" in ps  # PowerShell 5 de Windows lee mal los .ps1 UTF-8 sin BOM
    text = ps.decode()
    assert "Name = 'Modas Andrea';" in text and "Target = 'aplicacion.bat'" in text
    assert "Name = 'Modas Andrea (internet)'" in text and "Target = 'acceso_remoto.bat'" in text
    assert "exit 1" in text  # si falla, instalar.bat avisa en lugar de callar


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
