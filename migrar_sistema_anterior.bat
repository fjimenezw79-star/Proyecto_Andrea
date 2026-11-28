@echo off
setlocal
chcp 65001 >nul
title Modas Andrea - Pasar datos del sistema anterior
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo  Primero ejecuta instalar.bat
    pause
    exit /b 1
)
echo.
echo  Pasa productos (con fotos), ventas y apartados del sistema anterior.
echo  Arrastra aqui el archivo bazarges_data.db de tu carpeta PROYECTO ANDREA
echo  (o escribe la ruta completa) y presiona Enter.
echo.
set /p "DB=  Ruta de bazarges_data.db: "
set DB=%DB:"=%
if not exist "%DB%" (
    echo  [!] No se encontro el archivo: %DB%
    pause
    exit /b 1
)
".venv\Scripts\python.exe" -m scripts.migrar_sistema_anterior "%DB%"
echo.
echo  Listo. Puedes ejecutarlo de nuevo: no duplica nada.
pause
endlocal
