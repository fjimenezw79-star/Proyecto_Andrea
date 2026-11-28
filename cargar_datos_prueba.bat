@echo off
setlocal
chcp 65001 >nul
title Modas Andrea - Cargar catalogo de prueba
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo  Primero ejecuta instalar.bat
    pause
    exit /b 1
)
echo.
echo  Se cargaran 58 productos de prueba con foto, precio y existencias.
echo  Puedes ejecutarlo varias veces: no duplica nada.
echo.
".venv\Scripts\python.exe" -m scripts.importar_datos_prueba
echo.
pause
endlocal
