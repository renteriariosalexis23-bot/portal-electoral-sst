# Elecciones · IMAGE & HEALTH S.A.C.
Primera versión funcional local, en modo demostración. No está publicada ni habilitada para votos oficiales.

## Abrir
Requiere Node.js 24 o superior. Ejecuta INICIAR.cmd y abre http://127.0.0.1:8787.
Ingreso de prueba: DNI 12345678 y código DEMO-2026. La clave temporal del panel de junta se muestra en la consola.
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
- Resultados agregados restringidos al panel y disponibles después del cierre.
- Reporte JSON y eventos de inicio del servidor/importación.
- Fecha oficial configurada: 02/11/2026, 09:00–16:00, America/Lima (UTC-05:00).
En demo el horario de emisión está abierto para pruebas; los resultados conservan el bloqueo hasta la fecha oficial.

## Pendiente antes de uso oficial
Esta versión no acredita cumplimiento normativo ni anonimato frente al administrador del servidor. SQLite conserva orden físico y un administrador con acceso completo puede observar transacciones o modificar la base. Separar las tablas no resuelve ese riesgo. Para la elección oficial se necesita revisión independiente del diseño de privacidad, roles y custodia, protección de logs/copias y evidencia de integridad externa.
El registro de eventos actual NO es una auditoría inmutable ni acredita apertura/cierre formal. Se debe añadir registro durable de apertura/cierre, control de reloj, respaldo probado y procedimientos de contingencia.
La credencial es de posesión: hace falta un procedimiento fiable de entrega individual/verificación de identidad. No se implementaron revocación, recuperación ni doble control administrativo.
El servidor escucha solo en este equipo. Falta alojamiento con HTTPS y controles operativos para acceso desde sedes y remoto; no expongas directamente este servidor a Internet.

La junta debe confirmar padrón por comité, candidaturas, cantidad de marcas permitidas, titulares/suplentes, reglas de empates e impugnaciones, fechas del mandato y actas. Dos marcas en SST son un ejemplo, no una regla legal ni una asignación automática de cargos. No se proclaman ganadores automáticamente. El panel no reemplaza actas firmadas.

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
8. Define ADMIN_KEY en el entorno con al menos 32 caracteres aleatorios y ejecuta node server.mjs.

El programa usa demo-dni.sqlite y election.sqlite separados. No borres ni reinicies una base oficial para cambiar configuración o resolver errores.
Las tarjetas y el respaldo se escriben antes de confirmar la carga: ante un fallo, verifica la transacción y los archivos; no distribuyas tarjetas de una carga fallida.
