@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Actualizar Modas Andrea
cd /d "%~dp0"

echo.
echo  ==========================================================
echo     Modas Andrea - Actualizar a esta version
echo  ==========================================================
echo   Este asistente copia tus DATOS (productos, fotos, ventas,
echo   clientes, apartados y respaldos) y tu CONFIGURACION (.env)
echo   desde tu instalacion anterior hacia esta carpeta nueva.
echo   Tu carpeta anterior NO se modifica: queda como respaldo.
echo  ==========================================================
echo.

set "NEW=%~dp0"
set "NEW=%NEW:~0,-1%"

REM ---------------------------------------------------------------
REM 1. Modas Andrea debe estar cerrado
REM ---------------------------------------------------------------
:verificar_cerrado
netstat -ano 2>nul | findstr /r /c:":5000 .*LISTENING" >nul
if not errorlevel 1 (
    echo  [!] Modas Andrea esta abierto. Cierra TODAS sus ventanas negras
    echo      ^(aplicacion.bat o acceso_remoto.bat^) y luego presiona una tecla.
    pause >nul
    goto :verificar_cerrado
)

REM ---------------------------------------------------------------
REM 2. Buscar la instalacion anterior (accesos directos del escritorio)
REM ---------------------------------------------------------------
set "OLD="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); foreach($n in 'Modas Andrea.lnk','Modas Andrea (internet).lnk'){ $p=Join-Path $d $n; if(Test-Path $p){ $t=(New-Object -ComObject WScript.Shell).CreateShortcut($p).TargetPath; if($t){ Split-Path $t; break } } }" 2^>nul`) do set "OLD=%%i"

if defined OLD (
    if exist "!OLD!\data\modas-andrea.db" (
        echo  Se encontro tu instalacion anterior en:
        echo     !OLD!
        echo.
        choice /c SN /n /m "  Es la carpeta correcta? [S/N]: "
        if errorlevel 2 set "OLD="
    ) else (
        set "OLD="
    )
)

:pedir_carpeta
if not defined OLD (
    echo.
    echo  Indica la carpeta de tu instalacion ANTERIOR de Modas Andrea
    echo  ^(la que tiene la carpeta "data" con tus productos y ventas^).
    echo  Puedes ARRASTRAR la carpeta a esta ventana y presionar Enter.
    echo.
    set /p "OLD=  Carpeta anterior: "
    if not defined OLD goto :pedir_carpeta
    set "OLD=!OLD:"=!"
    if "!OLD:~-1!"=="\" set "OLD=!OLD:~0,-1!"
    if not exist "!OLD!\data\modas-andrea.db" (
        echo.
        echo  [!] En esa carpeta no esta data\modas-andrea.db. Revisa la ruta e intenta de nuevo.
        set "OLD="
        goto :pedir_carpeta
    )
)

REM ---------------------------------------------------------------
REM 3. Copiar datos y configuracion
REM ---------------------------------------------------------------
if /i "!OLD!"=="!NEW!" (
    echo.
    echo  Ya estas en la carpeta de tu instalacion; no hace falta copiar datos.
    goto :respaldo
)

echo.
echo  Copiando tus datos desde la instalacion anterior...
if exist "!NEW!\data\modas-andrea.db" (
    if not exist "!NEW!\data\respaldos" mkdir "!NEW!\data\respaldos"
    move /y "!NEW!\data\modas-andrea.db" "!NEW!\data\respaldos\modas-andrea_en_carpeta_nueva_antes_de_actualizar.db" >nul
    del /q "!NEW!\data\modas-andrea.db-wal" "!NEW!\data\modas-andrea.db-shm" 2>nul
)
robocopy "!OLD!\data" "!NEW!\data" /E /R:1 /W:1 /XD tienda_publicada /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
    echo  [!] No se pudieron copiar los datos. Revisa que Modas Andrea este cerrado y vuelve a intentarlo.
    goto :fallo
)
echo        Datos copiados: productos, fotos, ventas, clientes, apartados y respaldos.

if exist "!OLD!\.env" (
    copy /y "!OLD!\.env" "!NEW!\.env" >nul
    echo        Configuracion copiada: .env ^(claves de internet, IA y tienda^).
) else (
    echo        La instalacion anterior no tenia archivo .env; se creara uno nuevo.
)

REM ---------------------------------------------------------------
REM 4. Respaldo de la base antes de actualizarla
REM ---------------------------------------------------------------
:respaldo
if not exist "!NEW!\data\respaldos" mkdir "!NEW!\data\respaldos"
for /f %%f in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set "STAMP=%%f"
copy /y "!NEW!\data\modas-andrea.db" "!NEW!\data\respaldos\antes_de_actualizar_!STAMP!.db" >nul
if errorlevel 1 (
    echo  [!] No se pudo respaldar la base de datos. No se actualizo nada.
    goto :fallo
)
echo        Respaldo guardado: data\respaldos\antes_de_actualizar_!STAMP!.db

REM ---------------------------------------------------------------
REM 5. Instalar en la carpeta nueva (la base se actualiza sola al iniciar)
REM ---------------------------------------------------------------
echo.
echo  Instalando la nueva version...
echo.
call "!NEW!\instalar.bat" /actualizar
if errorlevel 1 goto :fallo

echo.
echo  ==========================================================
echo    ACTUALIZACION TERMINADA
echo  ==========================================================
echo    Desde ahora usa esta carpeta:
echo       !NEW!
echo    Los accesos directos del escritorio ya apuntan aqui:
echo      "Modas Andrea" y "Modas Andrea (internet)".
echo.
if /i not "!OLD!"=="!NEW!" (
    echo    Tu carpeta anterior quedo intacta como respaldo:
    echo       !OLD!
    echo    Cuando confirmes que todo funciona, puedes borrarla.
)
echo.
echo    Los celulares y tablets ya instalados no cambian nada: abren
echo    la nueva version solos la siguiente vez que tengan senal.
echo  ==========================================================
echo.
choice /c SN /n /m "  Deseas iniciar Modas Andrea ahora? [S/N]: "
if !errorlevel! equ 1 start "" "!NEW!\aplicacion.bat"
endlocal
exit /b 0

:fallo
echo.
echo  La actualizacion no se completo. Tus datos anteriores siguen intactos en la carpeta anterior.
pause
endlocal
exit /b 1
