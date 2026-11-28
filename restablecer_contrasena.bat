@echo off
setlocal
chcp 65001 >nul
title Restablecer contrasena - Modas Andrea
cd /d "%~dp0"
echo.
echo  ==========================================================
echo     Modas Andrea - Restablecer contrasena
echo  ==========================================================
echo   Cambia la contrasena de CUALQUIER usuario, administrador o
echo   vendedor, sin saber la anterior. Usalo si alguien la olvido.
echo   Tambien desbloquea al usuario y lo reactiva si estaba
echo   desactivado. Puede usarse con el sistema abierto.
echo  ==========================================================
if not exist ".venv\Scripts\python.exe" (
    echo.
    echo  [!] El sistema no esta instalado en esta carpeta. Ejecuta primero instalar.bat
    goto :fin
)
".venv\Scripts\python.exe" -m scripts.restablecer_contrasena
:fin
echo.
pause
endlocal
