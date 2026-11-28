@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Instalador de Modas Andrea
cd /d "%~dp0"

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
    echo  [!] Falta la app compilada (server\web_dist). Descarga de nuevo el sistema completo.
    goto :fallo
)
if not exist "data" mkdir data
"%VPY%" -c "from server import create_app; create_app()" >nul 2>&1
if errorlevel 1 (
    echo  [!] La aplicacion no pudo iniciar. Ejecuta aplicacion.bat para ver el detalle.
    goto :fallo
)
echo  [5/5] Base de datos lista en data\modas-andrea.db
choice /c SN /n /m "        Cargar el catalogo de prueba (58 productos con foto)? [S/N]: "
if !errorlevel! equ 1 "%VPY%" -m scripts.importar_datos_prueba

powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'Modas Andrea.lnk')); $s.TargetPath='%~dp0aplicacion.bat'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%SystemRoot%\System32\shell32.dll,13'; $s.Description='Iniciar Modas Andrea'; $s.Save()" >nul 2>&1
if not errorlevel 1 echo        Acceso directo "Modas Andrea" creado en el escritorio.

echo.
echo  ==========================================================
echo    INSTALACION COMPLETA
echo  ==========================================================
echo    Para abrir el sistema ejecuta aplicacion.bat
echo    o el acceso directo "Modas Andrea" del escritorio.
echo.
echo    Otros archivos: cargar_datos_prueba.bat, migrar_sistema_anterior.bat
echo                    y ejecutar_pruebas.bat
echo.
echo    Usuarios iniciales:  admin / admin123
echo                         vendedor / 12345
echo    Cambia estas contrasenas antes de usarlo en la tienda.
echo  ==========================================================
echo.
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
