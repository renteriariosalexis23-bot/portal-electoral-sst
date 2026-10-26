# Publicar el portal en sst.laboratorioimage.com

**Para:** quien administra el dominio `laboratorioimage.com` y la página web.
**Objetivo:** que el portal de elecciones se vea en `https://sst.laboratorioimage.com`, **sin tocar la página web ni el correo actuales**.
**Fecha límite sugerida:** 20 de octubre de 2026 (la elección es el 2 de noviembre).
**Costo:** ninguno. Cloudflare (plan Free) y el túnel son gratuitos.

## Cómo funciona
El portal corre en una PC de la junta electoral dentro de la empresa. Cloudflare Tunnel crea una conexión cifrada **saliente** desde esa PC: no se abren puertos en el router ni se expone la red interna. Los datos de la votación nunca salen de esa PC.

Para que Cloudflare pueda publicar `sst.laboratorioimage.com`, el **DNS** del dominio debe gestionarse en Cloudflare. El dominio sigue registrado donde está; solo cambian sus servidores de nombres.

## Antes de empezar (5 minutos)
Entra al panel donde hoy se gestiona el DNS de `laboratorioimage.com` y **exporta o toma captura de todos los registros**, en especial:
- [ ] Registros **A / CNAME** de la página web (`@` y `www`).
- [ ] Registros **MX** del correo.
- [ ] Registros **TXT** (SPF, DKIM, DMARC, verificaciones de Google/Microsoft).
- [ ] Cualquier otro subdominio en uso (por ejemplo `mail`, `webmail`, `ftp`, `cpanel`).

## Paso 1 · Agregar el dominio a Cloudflare
1. Crea una cuenta gratuita en https://dash.cloudflare.com (con un correo institucional de la empresa).
2. "Add a domain" → `laboratorioimage.com` → plan **Free**.
3. Cloudflare importa los registros automáticamente. **Compáralos uno por uno con tu lista** y agrega los que falten.
4. Recomendación: deja los registros de **correo (MX y relacionados) en "DNS only"** (nube gris).

## Paso 2 · Cambiar los servidores de nombres
1. Cloudflare te mostrará dos servidores de nombres (del tipo `xxxx.ns.cloudflare.com`).
2. En el panel del registrador del dominio `.pe`, reemplaza los servidores de nombres actuales por esos dos.
3. Espera a que Cloudflare marque el dominio como **Active** (normalmente unas horas; puede tardar hasta 48 h).
4. Verifica que **la página web abre** y que **el correo envía y recibe** con normalidad.

## Paso 3 · Conectar la PC de la junta (una sola vez)
En la PC de la junta, con Node.js 24 y cloudflared instalados (`winget install --id Cloudflare.cloudflared`):
1. Doble clic en **CONFIGURAR-TUNEL.cmd** (carpeta del portal).
2. Se abre el navegador: inicia sesión en Cloudflare y autoriza `laboratorioimage.com`.
3. El script crea el túnel `elecciones` y el registro `sst.laboratorioimage.com` automáticamente.

## Paso 4 · Ensayo
1. Doble clic en **INICIAR-PUBLICO.cmd**. Debe decir "Portal publicado en: https://sst.laboratorioimage.com".
2. Desde un celular con **datos móviles**, abre esa dirección y entra con el ingreso de prueba (DNI 12345678 · código DEMO-2026).

## Si algo sale mal
- Si la web o el correo fallan tras el cambio, revisa en Cloudflare que estén **todos** los registros de tu lista. Como último recurso, puedes volver a poner los servidores de nombres anteriores en el registrador.
- Si el túnel no conecta el día de la elección, INICIAR-PUBLICO.cmd puede usar un túnel temporal (`https://….trycloudflare.com`) borrando el túnel con `cloudflared tunnel delete elecciones`. La dirección temporal cambia en cada reinicio.
