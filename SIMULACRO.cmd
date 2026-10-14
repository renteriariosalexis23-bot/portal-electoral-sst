@echo off
chcp 65001 >nul
cd /d "%~dp0"
title SIMULACRO de la eleccion

where node >nul 2>nul || (echo Falta instalar Node.js 24 o superior: https://nodejs.org & pause & exit /b 1)
cls
echo ================================================================
echo   SIMULACRO (igual que el dia real, pero HOY)
echo ================================================================
echo  - Usa tu padron.xlsx y crea codigos y claves de junta NUEVOS
echo    (solo para el simulacro).
echo  - La votacion se abre YA y se cierra SOLA a la hora que elijas.
echo  - El escrutinio se abre despues del cierre, como el dia real.
echo  - No toca la eleccion oficial. Luego usa PASAR-A-OFICIAL.
echo.
echo  ANTES: cierra la ventana negra "Portal electoral - NO CERRAR".
echo ================================================================
echo.
set /p HORA=A que hora termina el simulacro? (ejemplo 16:00): 
node simulacro.mjs %HORA% || (pause & exit /b 1)

for /f "delims=" %%f in ('dir /b /o-d "credenciales\SIMULACRO-tarjetas-*.html" 2^>nul') do (start "" "credenciales\%%f" & goto t2)
:t2
for /f "delims=" %%f in ('dir /b /o-d "credenciales\SIMULACRO-claves-junta-*.html" 2^>nul') do (start "" "credenciales\%%f" & goto fin)
:fin
echo.
echo ================================================================
echo  LISTO. Se abrieron las tarjetas y las claves de la junta
echo  del SIMULACRO. Entregalas como si fuera el dia real.
echo  Ahora abre INICIAR-PUBLICO y comparte el enlace.
echo.
echo  Cuando termines el simulacro, usa PASAR-A-OFICIAL.
echo ================================================================
pause
