@echo off
setlocal
chcp 65001 >nul
title Modas Andrea - Pruebas automaticas
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo  Primero ejecuta instalar.bat
    pause
    exit /b 1
)
echo.
echo  [1/2] Instalando la herramienta de pruebas (solo la primera vez)...
".venv\Scripts\python.exe" -m pip install -r requirements-dev.txt --disable-pip-version-check -q
echo  [2/2] Ejecutando las pruebas del servidor (tarda alrededor de un minuto)...
echo        Se usan bases de datos temporales: tus datos NO se tocan.
echo.
".venv\Scripts\python.exe" -m pytest -q -p no:cacheprovider
if errorlevel 1 (
    echo.
    echo  [!] Alguna prueba fallo. Toma una foto de esta ventana y compartela.
) else (
    echo.
    echo  Todas las pruebas pasaron.
)
echo.
where node >nul 2>&1
if not errorlevel 1 (
    if exist "web\package.json" (
        echo  Opcional: pruebas de la interfaz con Node.js
        choice /c SN /n /m "  Ejecutar tambien las pruebas de la interfaz? [S/N]: "
        if errorlevel 2 goto :fin
        pushd web
        call npm ci --no-audit --no-fund
        call npx vitest run
        popd
    )
)
:fin
pause
endlocal
