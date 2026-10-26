# Elecciones · IMAGE & HEALTH S.A.C.
Primera versión funcional local, en modo demostración. No está publicada ni habilitada para votos oficiales.

## Abrir
Requiere Node.js 24 o superior. Ejecuta INICIAR.cmd y abre http://127.0.0.1:8787.
Ingreso de prueba: DNI 12345678 y código DEMO-2026. Panel de la junta de prueba: elige cualquier integrante y usa la clave JUNTA-DEMO.
Para probar: entra, abre cada cédula, selecciona candidaturas o blanco, revisa y confirma. Cierra sesión al finalizar.
Las pruebas se ejecutan con npm test. No requiere paquetes externos.

## Funciones
- Dos elecciones independientes con elegibilidad por comité.
- Ingreso con DNI + código personal aleatorio y legible; la base conserva solo una huella derivada (scrypt).
- Padrón desde Excel con validación por fila, tarjetas imprimibles y reemplazo de código perdido.
- Límite de intentos fallidos por red y por DNI.
- Sesiones de 30 minutos en memoria; cierre de sesión para equipos compartidos.
- Voto y registro de participación en una sola transacción; unicidad por persona y elección.
- Papeletas sin ID de trabajador, correo, IP ni timestamp.
- Reglas configurables de cantidad y composición; voto en blanco y revisión previa.
- Clave personal por integrante de la junta, registro de ingresos y escrutinio que exige dos integrantes; acta de escrutinio imprimible.
- Reporte JSON y eventos de inicio del servidor/importación.
- Fecha oficial configurada: 02/11/2026, 09:00–16:00, America/Lima (UTC-05:00).
En demo el horario de emisión está abierto para pruebas; los resultados conservan el bloqueo hasta la fecha oficial.

## Pendiente antes de uso oficial
Esta versión no acredita cumplimiento normativo ni anonimato frente al administrador del servidor. SQLite conserva orden físico y un administrador con acceso completo puede observar transacciones o modificar la base. Separar las tablas no resuelve ese riesgo. Para la elección oficial se necesita revisión independiente del diseño de privacidad, roles y custodia, protección de logs/copias y evidencia de integridad externa.
El registro de eventos actual NO es una auditoría inmutable ni acredita apertura/cierre formal. Se debe añadir registro durable de apertura/cierre, control de reloj, respaldo probado y procedimientos de contingencia.
La credencial es de posesión: hace falta un procedimiento fiable de entrega individual/verificación de identidad. No se implementaron revocación, recuperación ni doble control administrativo.
El servidor escucha solo en este equipo. Para acceso desde sedes usa la publicación con Cloudflare Tunnel descrita arriba; no expongas directamente el puerto del servidor a Internet.

La junta debe confirmar padrón por comité, candidaturas, cantidad de marcas permitidas, titulares/suplentes, reglas de empates e impugnaciones, fechas del mandato y actas. Dos marcas en SST son un ejemplo, no una regla legal ni una asignación automática de cargos. No se proclaman ganadores automáticamente. El panel no reemplaza actas firmadas.

## Publicar en internet gratis (Cloudflare Tunnel, sin dominio)
El portal corre en una PC de la empresa y Cloudflare le da una dirección pública con HTTPS. Los datos (data/election.sqlite) **nunca salen de esa PC**; Cloudflare solo transporta el tráfico cifrado.

**Una sola vez, en la PC de la junta:**
1. Instala Node.js 24 o superior (https://nodejs.org).
2. Instala cloudflared: abre "Símbolo del sistema" y ejecuta `winget install --id Cloudflare.cloudflared`.
3. Configura Windows para que la PC **no se suspenda** (Configuración → Sistema → Inicio/apagado y suspensión → "Nunca") y desactiva las actualizaciones automáticas ese día.
4. Haz un ensayo completo un día antes, desde un celular con datos móviles (no con el wifi de la oficina).

**El día de la elección:**
1. Conecta la PC por cable y, si es posible, a un UPS.
2. Doble clic en **INICIAR-PUBLICO.cmd**. Escribe la clave de la junta cuando la pida.
3. Copia la dirección `https://….trycloudflare.com` que aparece y compártela (WhatsApp, correo, carteles con QR).
4. No cierres ninguna de las dos ventanas hasta el cierre. Si la PC se reinicia, vuelve a abrir INICIAR-PUBLICO.cmd: **la dirección cambia** y hay que compartirla de nuevo (los votos ya registrados se conservan).

**Respaldos:** el servidor guarda una copia de la base al iniciar y cada 15 minutos en data/respaldos/. Al terminar, copia data/election.sqlite y data/respaldos/ a una USB bajo custodia de la junta.

**Con el dominio de la empresa:** sigue GUIA-DOMINIO.md (para quien administra laboratorioimage.com) y ejecuta una vez CONFIGURAR-TUNEL.cmd. Desde entonces INICIAR-PUBLICO.cmd publica en https://sst.laboratorioimage.com. Antes de cargar el padrón oficial agrega `"portalUrl": "https://sst.laboratorioimage.com"` en config.json para que aparezca en las tarjetas.

**Limitaciones del túnel gratuito sin dominio:** Cloudflare lo ofrece para pruebas, sin garantía de disponibilidad, y la dirección es aleatoria y cambia en cada reinicio. Para una dirección fija y un servicio más estable se necesita un dominio propio (desde unos US$10 al año) con un túnel con nombre, también gratuito.

## Ensayar con tu propio Excel (modo prueba)
Con config.json en `"mode": "demo"` puedes ejecutar `node import-padron.mjs padron.xlsx`: los códigos se guardan en la base de demostración (demo-dni.sqlite), las tarjetas salen marcadas "PRUEBA · NO VÁLIDA" en credenciales/PRUEBA-tarjetas-FECHA.html, y sirven para ingresar al portal de prueba. Para empezar de cero, cierra el servidor y borra data/demo-dni.sqlite. No entregues tarjetas de prueba a los trabajadores.

## Preparar datos (solo después de resolver los pendientes)
Cada trabajador ingresa con su **DNI + un código personal** (por ejemplo `K7QM-4XPA`). El DNI solo identifica a la persona; el código, que la junta entrega en persona, prueba que es ella. El código acepta minúsculas y no necesita el guion.

1. Completa config.json antes de inicializar producción. mode debe ser production y approved true. Es una confirmación de configuración, no una certificación legal. Opcional: agrega `"portalUrl"` con la dirección del portal para que aparezca en las tarjetas.
2. Sustituye candidatos de ejemplo y reglas por las aprobadas. Las candidaturas y configuración quedan congeladas al inicializar la base.
3. Llena **padron-plantilla.xlsx** (una fila por trabajador habilitado) y guárdalo como padron.xlsx:

   | DNI | NOMBRE | SST | HS |
   |---|---|---|---|
   | 45781236 | María Pérez Rojas | SÍ | SÍ |
   | 70123459 | José Quispe Huamán | SÍ | NO |

   - DNI de 8 dígitos (si Excel quitó el cero inicial, el sistema lo repone).
   - SST y HS: SÍ o NO según en qué comité puede votar. Se aceptan también X o vacío.
   - NOMBRE es opcional: solo se imprime en la tarjeta y en el cargo de entrega; no se guarda en la base.
4. Revisa el Excel sin guardar nada: `node import-padron.mjs padron.xlsx --revisar`. Si hay errores, indica la fila exacta (DNI con menos dígitos, repetido, sin comité, etc.) y no genera ningún código.
5. Carga el padrón: `node import-padron.mjs padron.xlsx`. Genera un código por fila y crea en la carpeta `credenciales/`:
   - `tarjetas-FECHA.html`: tarjetas para imprimir (8 por hoja A4) y un cargo de entrega para firmar.
   - `credenciales-FECHA.json`: respaldo de los códigos.
   La base guarda solo una huella derivada lenta (scrypt) de DNI + código. Protege la carpeta credenciales/: contiene los códigos; no la subas a GitHub ni la envíes por correo. Entrega cada tarjeta en sobre cerrado y pide firma del cargo.
6. Trabajadores nuevos: agrégalos al mismo Excel y vuelve a ejecutar el paso 5 antes de la apertura. Los que ya tienen código se saltan; solo se generan tarjetas para los nuevos.
7. Código perdido: `node reemplazar-codigo.mjs DNI "Nombre"` anula el código anterior y genera una tarjeta nueva, solo si esa persona aún no votó y antes del cierre.
8. Genera las claves de la junta: `node claves-junta.mjs`. Crea una clave distinta para cada integrante listado en junta.json y una hoja imprimible en credenciales/. Entrégalas en sobre cerrado. Si alguien pierde la suya: `node claves-junta.mjs presidente` (o secretaria, vocal1, vocal2) genera solo esa y anula la anterior.
9. Ejecuta node server.mjs (o INICIAR-PUBLICO.cmd). El servidor no arranca en modo oficial si la junta no tiene claves.

**Panel de la junta:** cada integrante entra con su nombre y su clave personal; cada ingreso queda en el registro de actividad. Los resultados solo se abren después del cierre y con **dos integrantes distintos**; el panel muestra el escrutinio y genera el **acta de escrutinio** para imprimir y firmar.

El programa usa demo-dni.sqlite y election.sqlite separados. No borres ni reinicies una base oficial para cambiar configuración o resolver errores.
Las tarjetas y el respaldo se escriben antes de confirmar la carga: ante un fallo, verifica la transacción y los archivos; no distribuyas tarjetas de una carga fallida.
