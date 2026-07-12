# Estado de accesos externos — Mercado Pago y Google/Gmail

Fecha: 2026-07-12 19:01 UTC.
Rama: `codex/web-control-plane-hardening`.
HEAD: `2d0ded2a355c5c801beac10c25fcde588947737b` (sin cambios durante esta tarea).
Estado Git inicial: limpio salvo los dos README ajenos conocidos (`README.md`
eliminado sin stagear y `README pulso.md` sin seguimiento), que permanecen
intactos y fuera del índice.

Este documento no contiene secretos. Los valores reales viven únicamente en
`F:\Pulso-codex\.env` (ignorado por Git; verificado con `git check-ignore`).

## Mercado Pago

- Aplicación: **Pulso Suscripciones** (creada 2026-07-12; la cuenta no tenía
  ninguna aplicación previa; el nombre "Pulso" a secas ya estaba tomado
  globalmente).
- Identificadores públicos: User ID `1155335678`; N.º de aplicación
  `2297043642763609`.
- Configuración elegida: Pagos online · desarrollo propio · producto
  **Suscripciones** (coincide con el contrato `BillingProvider`: checkout,
  cancel/resume, webhooks). Sin URL de tienda (no se inventó).
- **Sin OAuth de Mercado Pago**, conforme D-023: Pulso cobra en su propia
  cuenta; no es marketplace.
- Credenciales de PRUEBA: Access Token TEST presente en `.env` como
  `MERCADO_PAGO_ACCESS_TOKEN` (verificado prefijo `TEST-`). La Public Key de
  prueba existe en la consola; el código no reserva variable para ella y no se
  almacenó.
- `MERCADO_PAGO_CLIENT_ID` / `MERCADO_PAGO_CLIENT_SECRET`: vacíos. La consola
  actual de la app no expone Client ID/Secret separados para este flujo; si el
  adapter real los necesita, se obtienen de la misma pantalla de credenciales.
- Credenciales de PRODUCCIÓN: **no activadas**. Mercado Pago exige completar
  industria + sitio web + consentimiento + captcha + activación explícita.
  No se activaron, no se usaron, no se ejecutó ninguna llamada.
- Webhook: **pendiente**. No existe endpoint HTTP en el backend (solo
  `processBillingWebhook` a nivel service, sin ruta) y no hay URL pública de
  pruebas, así que no se configuró ninguna notificación. La "firma secreta"
  (`MERCADO_PAGO_WEBHOOK_SECRET`) la genera Mercado Pago recién al guardar una
  URL de webhook; queda para cuando GPT Sol publique el endpoint.
- No se crearon planes, suscripciones ni cobros. No se modificó moneda,
  impuestos ni datos legales de la cuenta.

## Google Cloud / Gmail

- Proyecto: **Pulso**, project ID `pulso-email-sender` (creado 2026-07-12; los
  únicos proyectos previos, `Default Gemini Project` y `nexus-bot-prod`, son
  ajenos y no se tocaron). Sin organización, **sin facturación** habilitada,
  sin recursos pagos.
- Nota: la cuenta requería 2SV/MFA para operar Google Cloud (obligatorio desde
  2025-12-29); el titular la activó personalmente durante esta tarea.
- Gmail API: **habilitada** (única API habilitada manualmente).
- Pantalla de consentimiento (Google Auth Platform): app **Pulso**, tipo
  **External**, estado **Testing** (no publicada); email de soporte y contacto
  del desarrollador: la cuenta remitente del titular.
- Usuario de prueba: únicamente la cuenta remitente del titular (1/100).
- Scopes (Data Access): únicamente `https://www.googleapis.com/auth/gmail.send`
  ("Send email on your behalf", categoría sensitive). Sin lectura, sin
  modificación, sin Drive/Calendar/Contacts.
- OAuth Client: **Pulso Gmail Sender (server)**, tipo **Web application**,
  creado 2026-07-12, sin JavaScript origins. El redirect local
  `http://127.0.0.1:53682/oauth/callback` quedó guardado y verificado en la
  consola el 2026-07-12; corresponde al bootstrap versionado de P5.
- Client ID y Client Secret: presentes en `.env` como
  `GOOGLE_GMAIL_CLIENT_ID` / `GOOGLE_GMAIL_CLIENT_SECRET`. `GOOGLE_GMAIL_SENDER`
  contiene la casilla remitente (no secreto).
- Refresh token: configurado localmente tras consentimiento personal y guardado
  únicamente cifrado como `GOOGLE_GMAIL_REFRESH_TOKEN_ENCRYPTED`.
- Se envió un único smoke a la propia casilla remitente. No se publicó la app ni
  se inició verificación de marca/dominio. Este OAuth es exclusivo del remitente
  transaccional y queda separado de cualquier login con Google.

### Activación local P5 posterior

- Consentimiento personal completado el 2026-07-12 con scope único
  `gmail.send`; el callback local validó `state`.
- Refresh token almacenado únicamente cifrado en `.env` como
  `GOOGLE_GMAIL_REFRESH_TOKEN_ENCRYPTED`; no se imprimió ni documentó su valor.
- Smoke real controlado: refresh OAuth y `users.messages.send` verdes, con un
  único correo dirigido a la propia casilla remitente. Sin procesar el outbox.
- La app continúa en Testing, no publicada y sin cambios de scopes.

## Archivos locales modificados

- `F:\Pulso-codex\.env` (ignorado por Git): `MERCADO_PAGO_ACCESS_TOKEN`,
  `GOOGLE_GMAIL_CLIENT_ID`, `GOOGLE_GMAIL_CLIENT_SECRET`,
  `GOOGLE_GMAIL_SENDER`. Los valores se copiaron portapapeles→archivo sin
  pasar por chat/terminal; el portapapeles se limpió tras cada copia.
- `.env.example`: bloque provisional Gmail (solo placeholders).
- `docs/integrations/EXTERNAL_ACCESS_STATUS.md` (este documento) y
  `docs/integrations/EXTERNAL_ACCESS_RUNBOOK.md` (nuevos).

## Verificaciones (2026-07-12)

- HEAD intacto (`2d0ded2a…`); índice vacío; los dos README ajenos sin tocar.
- `git diff --check`: limpio. `git grep -nE "TEST-[0-9]|GOCSPX-"`: sin
  coincidencias en archivos versionados.
- Prototipo visual sin Git (`F:\pulso-página web`): los SHA-256 de los seis
  archivos preservados coinciden exactamente antes y después de la tarea.
- `F:\Pulso`: `main` en `be54fd85…`, limpio.
- Typecheck: verde (5/5). Tests unitarios: 59/59 verdes (incluye billing).
- `test:db`: verde ("PostgreSQL integration and migration gate: OK").
- Lint: verde. Build web: verde. `check:production-safety`: OK.
- No ejecutado: security check de Electron (desktop sin cambios en esta
  tarea). No existe un validador de entorno standalone adicional; la
  validación fail-closed vive en `catalog.ts` y en el safety check.

## Bloqueos y próximos pasos para GPT Sol

1. **Webhook Mercado Pago**: implementar la ruta HTTP (con la verificación de
   firma del proveedor real y el inbox idempotente existente), desplegar una
   URL de pruebas alcanzable y recién entonces configurar la notificación en
   la consola; guardar la firma secreta como `MERCADO_PAGO_WEBHOOK_SECRET`.
2. **Adapter real de Mercado Pago**: implementar `BillingProvider` contra la
   API de suscripciones (preapproval) usando `MERCADO_PAGO_ACCESS_TOKEN`
   (TEST primero). No usar OAuth de vendedores.
3. **P5 Email**: outbox, worker y provider Gmail están implementados localmente.
   Bootstrap, consentimiento, token cifrado y smoke directo están listos. Falta
   validar auth → outbox → worker en aislamiento antes de promoverlo.
4. **Producción**: activar credenciales productivas de Mercado Pago y publicar
   la app OAuth solo con checkpoint L5 específico.
