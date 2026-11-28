@echo off
setlocal
chcp 65001 >nul
title Crear accesos directos de Modas Andrea
cd /d "%~dp0"
echo.
echo  Creando los accesos directos en el escritorio...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\accesos_directos.ps1" "%~dp0."
if errorlevel 1 (
    echo.
    echo  [!] Algun acceso directo no se pudo crear. Lee el mensaje de arriba.
    echo      Mientras tanto puedes abrir el sistema con aplicacion.bat o acceso_remoto.bat
    echo      de esta carpeta: clic derecho ^> Enviar a ^> Escritorio ^(crear acceso directo^).
) else (
    echo.
    echo  Listo: "Modas Andrea" y "Modas Andrea (internet)" estan en tu escritorio.
)
echo.
pause
endlocal
