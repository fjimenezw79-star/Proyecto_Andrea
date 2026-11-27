@echo off
setlocal
chcp 65001 >nul
title Modas Andrea - Servidor
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo.
    echo  Modas Andrea aun no esta instalado en este equipo. Ejecuta primero instalar.bat
    echo.
    pause
    exit /b 1
)
echo.
echo  Iniciando Modas Andrea...
".venv\Scripts\python.exe" run.py %*
if errorlevel 1 (
    echo.
    echo  [!] Modas Andrea se detuvo por un error. Revisa el mensaje anterior.
    echo      Si el puerto 5000 esta ocupado, cambia PORT en el archivo .env
    pause
)
endlocal
