@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set /p "U=  Usuario: "
set /p "P=  Nueva contrasena (6 o mas caracteres): "
".venv\Scripts\python.exe" -m scripts.restablecer_contrasena "%U%" "%P%"
pause
endlocal
