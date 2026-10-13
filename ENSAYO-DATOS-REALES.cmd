@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Ensayo con datos reales

where node >nul 2>nul || (echo Falta instalar Node.js 24 o superior: https://nodejs.org & pause & exit /b 1)
node -e "process.exit(require('./config.json').mode==='demo'?0:1)" || (echo Este archivo solo sirve en MODO PRUEBA. No se borro nada. & pause & exit /b 1)

cls
echo ================================================================
echo   ENSAYO CON DATOS REALES
echo ================================================================
echo  Esto BORRA todo lo de prueba: votos, firmas, actas de prueba,
echo  el DNI 12345678 de ejemplo y los codigos de prueba anteriores.
echo  Luego carga tu Excel padron.xlsx y crea codigos nuevos.
echo.
echo  ANTES: cierra la ventana negra "Portal electoral - NO CERRAR".
echo ================================================================
echo.
if not exist padron.xlsx (echo No encuentro padron.xlsx en esta carpeta. Ponlo aqui y vuelve a intentar. & pause & exit /b 1)
set /p OK=Escribe SI y pulsa Enter para continuar: 
if /i not "%OK%"=="SI" (echo Cancelado. No se borro nada. & pause & exit /b 1)

del /q "data\demo-dni.sqlite" "data\demo-dni.sqlite-wal" "data\demo-dni.sqlite-shm" 2>nul
if exist "data\demo-dni.sqlite" (echo. & echo No se pudo borrar: el portal sigue abierto. Cierra la ventana "Portal electoral - NO CERRAR" y vuelve a intentar. & pause & exit /b 1)
del /q "credenciales\PRUEBA-*" 2>nul
echo Datos de prueba borrados.
echo.

node import-padron.mjs padron.xlsx --revisar || (echo. & echo Corrige el Excel y vuelve a intentar. & pause & exit /b 1)
node import-padron.mjs padron.xlsx || (pause & exit /b 1)

for /f "delims=" %%f in ('dir /b /o-d "credenciales\PRUEBA-tarjetas-*.html" 2^>nul') do (start "" "credenciales\%%f" & goto listo)
:listo
echo.
echo ================================================================
echo  LISTO. Se abrieron las tarjetas con los codigos de cada persona.
echo  Ahora abre INICIAR-PUBLICO para empezar el ensayo.
echo  Clave de la junta en el ensayo: JUNTA-DEMO
echo ================================================================
pause
