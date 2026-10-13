@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Actualizar portal electoral
if not exist "%~dp0server.mjs" (
  echo ESTE ARCHIVO DEBE ESTAR DENTRO DE LA CARPETA DEL PORTAL,
  echo junto a INICIAR-PUBLICO.cmd ^(por ejemplo C:\portal-electoral^).
  echo Muevelo alli y vuelve a abrirlo. No se hizo ningun cambio.
  pause
  exit /b 1
)
echo ================================================================
echo  ACTUALIZAR EL PORTAL
echo  Antes de seguir:
echo   1. Cierra las ventanas negras del portal si estan abiertas.
echo   2. Descarga el ZIP nuevo desde GitHub (boton Code - Download ZIP).
echo  Se conservan: data (votos), credenciales, config.json, junta.json
echo  y padron.xlsx.
echo ================================================================
pause

for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path"`) do set "DESCARGAS=%%d"
if not defined DESCARGAS set "DESCARGAS=%USERPROFILE%\Downloads"
set "ZIP="
for /f "delims=" %%f in ('dir /b /o-d "%DESCARGAS%\portal-electoral-sst-*.zip" 2^>nul') do if not defined ZIP set "ZIP=%DESCARGAS%\%%f"
if not defined ZIP (echo No encontre el ZIP en %DESCARGAS%. Descargalo de GitHub y vuelve a intentar. & pause & exit /b 1)
echo Usando: %ZIP%

set "TMPDIR=%TEMP%\portal-actualizacion"
if exist "%TMPDIR%" rmdir /s /q "%TMPDIR%"
mkdir "%TMPDIR%"
tar -xf "%ZIP%" -C "%TMPDIR%" || (echo No se pudo abrir el ZIP. & pause & exit /b 1)
set "SRC="
for /d %%s in ("%TMPDIR%\portal-electoral-sst-*") do set "SRC=%%s"
if not defined SRC (echo El ZIP no tiene la carpeta esperada. & pause & exit /b 1)

robocopy "%SRC%" "%~dp0." /E /XD data credenciales /XF config.json junta.json padron.xlsx /NFL /NDL /NJH /NJS /NP
if errorlevel 8 (echo Hubo un error al copiar. No abras el portal y avisa. & pause & exit /b 1)
rmdir /s /q "%TMPDIR%"

echo.
echo Revisando archivos...
node --check server.mjs && node --check public\app.js && (echo Revision: OK) || (echo AVISO: hay un problema en los archivos. Avisa antes de abrir el portal.)
echo.
echo Listo. Portal actualizado. Ya puedes abrir INICIAR-PUBLICO.cmd
echo (Puedes borrar el ZIP de Descargas.)
pause
