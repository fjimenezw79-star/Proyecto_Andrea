@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Instalador de Modas Andrea
cd /d "%~dp0"
REM actualizar.bat llama "instalar.bat /actualizar": no ofrece datos de prueba ni abrir el sistema
set "UPDATE="
if /i "%~1"=="/actualizar" set "UPDATE=1"

echo.
echo  ==========================================================
echo     Modas Andrea - Instalador
echo  ==========================================================
echo   Este asistente instala Python (si hace falta), crea el
echo   entorno virtual e instala todas las librerias necesarias.
echo  ==========================================================
echo.

REM 1. Buscar Python 3.12 o superior
set "PY="
call :probar "py -3"
call :probar "python"
call :probar "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
call :probar "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PY (
    echo  [1/5] No se encontro Python 3.12 o superior. Instalando Python 3.12...
    where winget >nul 2>&1
    if errorlevel 1 (
        echo  [!] Este equipo no tiene winget. Se abrira la pagina de descarga de Python.
        echo      Durante la instalacion MARCA "Add python.exe to PATH" y vuelve a ejecutar instalar.bat
        start "" "https://www.python.org/downloads/windows/"
        goto :fallo
    )
    winget install --id Python.Python.3.12 -e --silent --accept-package-agreements --accept-source-agreements
    call :probar "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    call :probar "py -3"
    if not defined PY (
        echo  [!] Python se instalo, pero esta ventana aun no lo detecta. Cierrala y vuelve a ejecutar instalar.bat
        goto :fallo
    )
)
echo  [1/5] Python encontrado:
!PY! --version

REM 2. Entorno virtual
if exist ".venv\Scripts\python.exe" (
    echo  [2/5] El entorno virtual ya existe; se actualizara.
) else (
    echo  [2/5] Creando entorno virtual en la carpeta .venv ...
    !PY! -m venv .venv
    if errorlevel 1 goto :fallo
)
set "VPY=%~dp0.venv\Scripts\python.exe"

REM 3. Librerias
echo  [3/5] Instalando librerias...
"%VPY%" -m pip install --upgrade pip --disable-pip-version-check -q
"%VPY%" -m pip install -r requirements.txt --disable-pip-version-check -q
if errorlevel 1 (
    echo  [!] Fallo la instalacion de librerias. Revisa tu conexion a internet e intenta de nuevo.
    goto :fallo
)

REM 4. Configuracion
echo  [4/5] Configurando...
"%VPY%" -m scripts.configurar

REM 5. Base de datos
if not exist "server\web_dist\index.html" (
    echo  [!] Falta la app compilada ^(server\web_dist^). Descarga de nuevo el sistema completo.
    goto :fallo
)
if not exist "data" mkdir data
"%VPY%" -c "from server import create_app; create_app()" >nul 2>&1
if errorlevel 1 (
    echo  [!] La aplicacion no pudo iniciar. Ejecuta aplicacion.bat para ver el detalle.
    goto :fallo
)
echo  [5/5] Base de datos lista en data\modas-andrea.db
if not defined UPDATE (
    choice /c SN /n /m "        Cargar el catalogo de prueba (58 productos con foto)? [S/N]: "
    if !errorlevel! equ 1 "%VPY%" -m scripts.importar_datos_prueba
)

REM Accesos directos del escritorio (si fallan, se muestra el motivo y se puede repetir con crear_accesos_directos.bat)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\accesos_directos.ps1" "%~dp0."
if errorlevel 1 echo  [!] Ejecuta crear_accesos_directos.bat para intentarlo de nuevo.

echo.
echo  ==========================================================
echo    INSTALACION COMPLETA
echo  ==========================================================
echo    Accesos directos en el escritorio:
echo      "Modas Andrea"            solo en esta red (WiFi del negocio)
echo      "Modas Andrea (internet)" celulares fuera del local y tienda en linea
echo.
echo    Otros archivos: cargar_datos_prueba.bat, migrar_sistema_anterior.bat
echo                    y ejecutar_pruebas.bat
echo.
echo    Usuarios iniciales:  admin / admin123
echo                         vendedor / 12345
echo    Cambia estas contrasenas antes de usarlo en la tienda.
echo  ==========================================================
echo.
if defined UPDATE (
    endlocal
    exit /b 0
)
choice /c SN /n /m "  Deseas iniciar Modas Andrea ahora? [S/N]: "
if !errorlevel! equ 1 start "" "%~dp0aplicacion.bat"
endlocal
exit /b 0

:probar
if defined PY exit /b 0
if exist "%~1" (
    "%~1" -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)" >nul 2>&1
    if not errorlevel 1 set PY="%~1"
    exit /b 0
)
%~1 -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)" >nul 2>&1
if not errorlevel 1 set "PY=%~1"
exit /b 0

:fallo
echo.
echo  La instalacion no se completo. Revisa los mensajes anteriores.
pause
endlocal
exit /b 1
