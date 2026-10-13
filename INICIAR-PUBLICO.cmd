@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Portal electoral - publicacion

where node >nul 2>nul || (echo Falta instalar Node.js 24 o superior: https://nodejs.org & pause & exit /b 1)
where cloudflared >nul 2>nul || (echo Falta instalar cloudflared. Abre una ventana de comandos y ejecuta: & echo     winget install --id Cloudflare.cloudflared & echo Luego cierra esta ventana y vuelve a abrir INICIAR-PUBLICO.cmd & pause & exit /b 1)

set TRUST_CLOUDFLARE=1
set PUBLIC_HOST=elecciones.imagehealth.com.pe
if not defined PORT set PORT=8787
cls

start "Portal electoral - NO CERRAR" cmd /k node server.mjs
timeout /t 4 /nobreak >nul

cloudflared tunnel info elecciones >nul 2>nul && goto fija
echo ================================================================
echo  (Tunel temporal) En unos segundos aparecera abajo la direccion,
echo  se copiara sola y se abrira en el navegador.
echo  Compartela con los trabajadores. NO cierres ninguna de las dos
echo  ventanas hasta que termine la votacion.
echo  Si se reinicia, la direccion CAMBIA: vuelve a compartirla.
echo ================================================================
node tunel.mjs
pause
exit /b

:fija
echo ================================================================
echo  Portal publicado en:  https://elecciones.imagehealth.com.pe
echo  NO cierres ninguna de las dos ventanas hasta que termine la
echo  votacion. Si se reinicia, vuelve a abrir este archivo.
echo ================================================================
cloudflared tunnel run --url http://127.0.0.1:%PORT% elecciones
pause
