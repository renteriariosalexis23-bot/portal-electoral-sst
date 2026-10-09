# Elecciones · IMAGE & HEALTH S.A.C.
Primera versión funcional local, en modo demostración. No está publicada ni habilitada para votos oficiales.

## Abrir
Requiere Node.js 24 o superior. Ejecuta INICIAR.cmd y abre http://127.0.0.1:8787.
Credencial de prueba: DEMO-2026. La clave temporal del panel de junta se muestra en la consola.
Para probar: entra, abre cada cédula, selecciona candidaturas o blanco, revisa y confirma. Cierra sesión al finalizar.
Las pruebas se ejecutan con npm test. No requiere paquetes externos.

## Funciones
- Dos elecciones independientes con elegibilidad por comité.
- Credenciales aleatorias; la base conserva únicamente su hash.
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

## Preparar datos (solo después de resolver los pendientes)
1. Completa config.json antes de inicializar producción. mode debe ser production y approved true. Es una confirmación de configuración, no una certificación legal.
2. Sustituye candidatos de ejemplo y reglas por las aprobadas. Las candidaturas y configuración quedan congeladas al inicializar la base.
3. Prepara un JSON siguiendo padron.ejemplo.json. Usa códigos internos; no hace falta DNI ni nombre en esta base.
4. Ejecuta node import-padron.mjs padron.json credenciales.json. No se reemplazan personas ni archivos existentes. Protege credenciales.json: contiene secretos, entrégalos individualmente. No lo adjuntes a un repositorio.
5. Define ADMIN_KEY en el entorno con al menos 32 caracteres aleatorios y ejecuta node server.mjs.
El programa usa demo.sqlite y election.sqlite separados. No borres ni reinicies una base oficial para cambiar configuración o resolver errores.
La importación genera el archivo de credenciales antes del commit: ante fallo, verifica la transacción y el archivo; no distribuyas credenciales de una importación fallida.
