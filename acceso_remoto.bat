@echo off
setlocal
chcp 65001 >nul
title Modas Andrea - Servidor con acceso por internet
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo.
    echo  Modas Andrea aun no esta instalado en este equipo. Ejecuta primero instalar.bat
    echo.
    pause
    exit /b 1
)
echo.
echo  Iniciando Modas Andrea con acceso desde internet (Cloudflare)...
echo  La primera vez se descarga la herramienta de Cloudflare (unos 50 MB).
echo.
echo  Importante: por internet NO se puede entrar con las contrasenas iniciales
echo  (admin123 y 12345). Cambialas antes en "Mi cuenta" desde esta computadora.
echo.
".venv\Scripts\python.exe" run.py --internet %*
if errorlevel 1 (
    echo.
    echo  [!] Modas Andrea se detuvo por un error. Revisa el mensaje anterior.
    pause
)
endlocal
