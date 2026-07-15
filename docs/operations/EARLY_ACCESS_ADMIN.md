# Operación de acceso anticipado Personal y Teams

## Alcance

`/internal/early-access` es una bandeja global, separada del panel de cada
organización. La ruta, la navegación y todas sus Server Actions exigen que la
identidad persistida tenga `User.isSuperAdmin=true`. Un `ORG_ADMIN` común no
puede listar solicitudes ni ejecutar decisiones.

El panel recibe tres tipos de consultas de marketing:

- `personal-ai` crea una solicitud de Personal AI;
- `teams` y `business` crean una solicitud de piloto Pulso Teams.

El flujo de Personal es:

1. Marketing envía una consulta `personal-ai` a `/api/contact`.
2. El backend persiste o actualiza la solicitud, registra un evento y encola:
   la notificación interna y un acuse automático al solicitante.
3. Un superadmin aprueba o rechaza desde la bandeja.
4. La decisión encola una respuesta automática.
5. Si el email aprobado no tenía cuenta, recibe un enlace de alta de un solo
   uso, válido siete días. El enlace crea una identidad verificada y un
   workspace Personal mínimo; `/register` continúa cerrado.
6. La autorización de Personal AI consulta el estado `APPROVED` en PostgreSQL.
   Revocar el acceso tiene efecto en la siguiente solicitud sin editar `.env`.

El flujo Teams usa la misma bandeja y auditoría, pero una aprobación sólo
acepta el piloto y encola una respuesta específica. No crea usuarios,
organizaciones, membresías, workspaces Personal ni grants de IA: el alta de la
organización se coordina después de forma explícita.

La API key de Gemini nunca se guarda en estas tablas ni llega al panel. Sigue
siendo un secreto server-side en `PULSO_PERSONAL_ACCOUNT_AI_GEMINI_API_KEY`.

## Bootstrap del primer superadmin

El comando es deliberadamente genérico. Para una cuenta ya existente sólo la
promueve si está activa, verificada y tiene al menos una membresía:

```powershell
$env:DATABASE_URL='<destino explícito>'
pnpm --filter @pulso/database exec tsx --tsconfig ../../apps/web/tsconfig.json ../../scripts/manage-early-access.ts `
  promote-superadmin --email admin@example.com --ack promote-existing-user
```

No hardcodear emails en migraciones ni seeds y no ejecutar el seed en
producción.

Si el primer superadmin todavía no existe, el modo bootstrap exige un ACK más
fuerte. Crea un workspace operativo mínimo, una contraseña aleatoria que nunca
se muestra ni persiste en claro y encola un enlace de restablecimiento de un
solo uso. La persona elige su contraseña desde el email:

```powershell
$env:DATABASE_URL='<destino explícito>'
$env:WORKLOG_ENCRYPTION_KEY='<secret store>'
$env:PULSO_APP_URL='https://app.example.com'
pnpm --filter @pulso/database exec tsx --tsconfig ../../apps/web/tsconfig.json ../../scripts/manage-early-access.ts `
  promote-superadmin --email admin@example.com --name 'Nombre' --ack create-superadmin-account
```

## Importar una solicitud histórica confirmada

Las consultas recibidas antes de esta migración sólo existían cifradas en la
outbox. Se pueden importar de forma explícita sin leer ni descifrar el histórico:

```powershell
$env:DATABASE_URL='<destino explícito>'
$env:WORKLOG_ENCRYPTION_KEY='<secret store>'
pnpm --filter @pulso/database exec tsx --tsconfig ../../apps/web/tsconfig.json ../../scripts/manage-early-access.ts `
  import-request --email person@example.com --name 'Persona' --product PERSONAL_AI --ack import-confirmed-request
```

El import genera un nuevo evento `REQUESTED` y un acuse automático mediante la
outbox. Es idempotente respecto de email y producto: una repetición aumenta el
contador, no crea otra identidad de solicitud.

## Recuperar consultas Teams anteriores

Antes de que `teams` y `business` alimentaran la bandeja, esas consultas
quedaban únicamente como mensajes `CONTACT_REQUEST` cifrados en la outbox. El
backfill las descifra dentro del proceso autorizado, importa sólo solicitudes
Teams faltantes y no imprime nombres, emails ni mensajes:

```powershell
$env:DATABASE_URL='<destino explícito>'
$env:WORKLOG_ENCRYPTION_KEY='<secret store>'
pnpm --filter @pulso/database exec tsx --tsconfig ../../apps/web/tsconfig.json ../../scripts/backfill-team-early-access.ts `
  --ack backfill-team-contacts
```

El proceso es idempotente por email normalizado y producto. Informa únicamente
los conteos inspeccionados, importados, ya existentes e inválidos. Cada alta
recuperada registra `source=CONTACT_OUTBOX_BACKFILL` y encola el acuse de recibo
que el flujo antiguo no enviaba al solicitante.

## Apertura de Personal AI

Además de una aprobación en DB, el proveedor global debe estar listo:

```dotenv
PULSO_PERSONAL_ACCOUNT_AI_ENABLED=true
PULSO_PERSONAL_ACCOUNT_AI_GEMINI_API_KEY=<secret>
PULSO_PERSONAL_ACCOUNT_AI_DATA_TERMS_ACK=paid-service-no-training
PULSO_PERSONAL_ACCOUNT_AI_MODEL=gemini-3.1-flash-lite
```

`PULSO_PERSONAL_ACCOUNT_AI_ALLOWED_EMAILS` queda como bypass de emergencia y
compatibilidad; la operación normal debe hacerse desde el panel.

Después de migrar y recrear la aplicación:

1. probar que una identidad no superadmin obtiene 404 en el panel;
2. aprobar una solicitud de prueba;
3. procesar la outbox y completar el enlace de alta;
4. conectar Desktop y verificar una generación administrada;
5. probar una cuenta pendiente (403) y luego revocar la aprobada;
6. verificar que la revocación impide nuevas generaciones sin borrar datos
   locales del equipo.
7. enviar consultas `teams` y `business`, verificar que aparecen como
   `Pulso Teams` y que aprobarlas no crea identidades ni organizaciones.
