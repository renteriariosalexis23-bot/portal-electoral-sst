@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Configurar tunel elecciones.imagehealth.com.pe (una sola vez)
set HOST=elecciones.imagehealth.com.pe

where cloudflared >nul 2>nul || (echo Falta instalar cloudflared. Ejecuta: winget install --id Cloudflare.cloudflared & pause & exit /b 1)

echo Paso 1 de 3: se abrira el navegador. Inicia sesion en Cloudflare y elige imagehealth.com.pe
pause
cloudflared tunnel login || (echo No se pudo autorizar. & pause & exit /b 1)

echo Paso 2 de 3: creando el tunel "elecciones"...
cloudflared tunnel info elecciones >nul 2>nul || cloudflared tunnel create elecciones || (echo No se pudo crear el tunel. & pause & exit /b 1)

echo Paso 3 de 3: conectando https://%HOST% ...
cloudflared tunnel route dns elecciones %HOST% || (echo No se pudo crear la direccion. Revisa que el dominio ya este activo en Cloudflare. & pause & exit /b 1)

echo.
echo Listo. Desde ahora INICIAR-PUBLICO.cmd usara https://%HOST%
pause
