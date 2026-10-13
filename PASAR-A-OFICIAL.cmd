@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Pasar a modo OFICIAL

where node >nul 2>nul || (echo Falta instalar Node.js 24 o superior: https://nodejs.org & pause & exit /b 1)
cls
echo ================================================================
echo   PASAR A MODO OFICIAL (eleccion del 2 de noviembre)
echo ================================================================
echo  Esto hace lo siguiente:
echo   - BORRA todo lo de prueba: votos, firmas, actas y codigos de prueba.
echo   - Activa la configuracion oficial (6 candidatas, SST y HS).
echo   - Carga padron.xlsx y crea los CODIGOS DEFINITIVOS.
echo   - Crea las CLAVES PERSONALES de la junta (ya no sirve JUNTA-DEMO).
echo.
echo  ANTES: cierra la ventana negra "Portal electoral - NO CERRAR".
echo ================================================================
echo.
set /p OK=Escribe OFICIAL y pulsa Enter para continuar: 
if /i not "%OK%"=="OFICIAL" (echo Cancelado. No se cambio nada. & pause & exit /b 1)

node pasar-a-oficial.mjs
if errorlevel 3 goto repetir
if errorlevel 1 (pause & exit /b 1)
goto abrir

:repetir
echo.
echo  Si continuas se crean codigos y claves NUEVOS: las tarjetas y
echo  claves que ya imprimiste DEJAN DE SERVIR y hay que reimprimir.
set /p OK2=Escribe REPETIR y pulsa Enter para continuar: 
if /i not "%OK2%"=="REPETIR" (echo Cancelado. No se cambio nada. & pause & exit /b 1)
node pasar-a-oficial.mjs --repetir || (pause & exit /b 1)

:abrir
for /f "delims=" %%f in ('dir /b /o-d "credenciales\tarjetas-*.html" 2^>nul') do (start "" "credenciales\%%f" & goto t2)
:t2
for /f "delims=" %%f in ('dir /b /o-d "credenciales\claves-junta-*.html" 2^>nul') do (start "" "credenciales\%%f" & goto fin)
:fin
echo.
echo ================================================================
echo  LISTO. Se abrieron dos documentos para IMPRIMIR:
echo   1. Tarjetas con el codigo de cada trabajador.
echo   2. Claves personales de los 4 integrantes de la junta.
echo  Entregalos en SOBRE CERRADO. Nunca por WhatsApp ni correo.
echo.
echo  El 2 de noviembre: abre INICIAR-PUBLICO antes de las 9:00 a. m.
echo  La votacion se abre y se cierra sola (9:00 a. m. - 4:00 p. m.).
echo  NO actualices el portal desde ahora hasta que termine la eleccion.
echo ================================================================
pause
