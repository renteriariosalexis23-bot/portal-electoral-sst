# Instalar el portal en el hosting de la empresa (sst.laboratorioimage.com)

**Para:** quien administra el hosting y el dominio `laboratorioimage.com`.
**Elección:** lunes 2 de noviembre de 2026, 9:00 a. m. – 4:00 p. m. (hora de Perú). Se abre y se cierra sola.
**Conviene tenerlo funcionando a más tardar el jueves 29 de octubre**, para hacer un simulacro con la junta.

## Qué es
- Una aplicación **Node.js** sin dependencias externas: no hace falta `npm install`.
- Usa la base de datos **SQLite** integrada en Node (`node:sqlite`). Crea los archivos en la carpeta `data/`.
- Sirve la página web y la API en un solo proceso.

## Requisitos del servidor
- **Node.js 24** (mínimo 22.5). Compruébalo con `node --version`.
- Un **proceso que quede siempre encendido**: pm2, systemd o "Setup Node.js App" de cPanel.
- Permiso de **escritura** en las carpetas `data/` y `credenciales/`, dentro de la carpeta del portal.
- **HTTPS** activo en `sst.laboratorioimage.com`.
- **Hora del servidor correcta** (NTP). La votación se abre y cierra según el reloj del servidor.

## Instalación
1. Descomprime el ZIP en una carpeta del servidor, por ejemplo `/home/usuario/portal-electoral`.
2. Inicia el portal con estas variables de entorno:

   ```
   PORT=8787                              # el puerto que asigne tu hosting
   TRUST_PROXY=1                          # obligatorio detrás de nginx/Apache/Passenger
   PUBLIC_HOST=sst.laboratorioimage.com
   node server.mjs
   ```

   Ejemplo con pm2:

   ```
   TRUST_PROXY=1 PUBLIC_HOST=sst.laboratorioimage.com PORT=8787 pm2 start server.mjs --name elecciones
   ```

   - **`TRUST_PROXY=1` es importante.** Sin esa variable, el portal ve a todos los votantes con la IP del proxy. Con pocos intentos fallidos bloquearía a todos por 15 minutos.
   - El portal escucha en `127.0.0.1`. Si tu hosting necesita otra interfaz, define también `HOST=0.0.0.0`.
3. Configura el proxy inverso hacia ese puerto. Debe conservar el `Host` y enviar `X-Forwarded-For`. Ejemplo con nginx:

   ```
   location / {
     proxy_pass http://127.0.0.1:8787;
     proxy_set_header Host $host;
     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
     proxy_set_header X-Forwarded-Host $host;
   }
   ```

4. Abre `https://sst.laboratorioimage.com`. Debe verse la página de las elecciones.

## Simulacro (antes de pasar a oficial)
Hazlo junto con la junta electoral:

```
node simulacro.mjs 17:00      # hora de cierre de HOY, hora de Perú
```

Después reinicia el proceso, por ejemplo `pm2 restart elecciones`.

- Necesita el archivo `padron.xlsx` en la carpeta del portal. Ese archivo lo entrega la junta.
- Genera tarjetas de prueba (prefijo `SIMULACRO-`) en la carpeta `credenciales/`.

## Pasar a modo oficial (con la junta presente)

```
node pasar-a-oficial.mjs
```

Después reinicia el proceso.

- Borra los datos de prueba y del simulacro.
- Carga `padron.xlsx`.
- Genera los **códigos de los trabajadores** y las **claves de la junta** en `credenciales/`.

**Confidencialidad.** Los archivos de `credenciales/` y el `padron.xlsx` contienen códigos y datos personales.
1. Entrégalos a la junta electoral en el momento.
2. Después **bórralos del servidor**.
3. Nadie fuera de la junta debe tenerlos.

## Reglas durante la elección
- **No modificar `config.json`** después de pasar a oficial. Si cambia, el portal se niega a arrancar, como protección.
- **No borrar la carpeta `data/`.** Ahí están los votos; las copias de seguridad se guardan en `data/respaldos/`.
- Reiniciar el proceso **no pierde votos**.
- **No actualizar el código el 2 de noviembre.**
- **Los resultados solo los abre la junta:** dos integrantes, con sus claves, después del cierre.
