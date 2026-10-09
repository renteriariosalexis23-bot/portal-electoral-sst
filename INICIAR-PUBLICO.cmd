@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Portal electoral - publicacion

where node >nul 2>nul || (echo Falta instalar Node.js 24 o superior: https://nodejs.org & pause & exit /b 1)
where cloudflared >nul 2>nul || (echo Falta instalar cloudflared. Abre una ventana de comandos y ejecuta: & echo     winget install --id Cloudflare.cloudflared & echo Luego cierra esta ventana y vuelve a abrir INICIAR-PUBLICO.cmd & pause & exit /b 1)

set TRUST_CLOUDFLARE=1
if not defined PORT set PORT=8787
if not defined ADMIN_KEY (
  echo.
  echo En modo oficial escribe la clave de la junta ^(minimo 32 caracteres^).
  echo En modo prueba deja vacio y presiona Enter.
  set /p ADMIN_KEY=Clave de la junta: 
)
cls

start "Portal electoral - NO CERRAR" cmd /k node server.mjs
timeout /t 4 /nobreak >nul

echo ================================================================
echo  En unos segundos aparecera abajo la direccion publica:
echo      https://....trycloudflare.com
echo  Compartela con los trabajadores. NO cierres ninguna de las dos
echo  ventanas hasta que termine la votacion.
echo  Si se reinicia, la direccion CAMBIA: vuelve a compartirla.
echo ================================================================
cloudflared tunnel --url http://127.0.0.1:%PORT%
pause
