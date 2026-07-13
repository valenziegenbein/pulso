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
  único correo directo dirigido a la propia casilla remitente.
- Smoke end-to-end posterior: PostgreSQL efímero migrado desde cero, identidad
  sintética, auth → outbox cifrado → worker → Gmail → estado `SENT`, con un
  segundo correo a la propia casilla. Contenedor y volumen destruidos al final.
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
   Bootstrap, consentimiento, token cifrado y ambos smokes están listos. Falta
   preparar candidata inmutable y promover mediante el runbook autorizado.
4. **Producción**: activar credenciales productivas de Mercado Pago y publicar
   la app OAuth solo con checkpoint L5 específico.

## Actualización P6 local — 2026-07-12

- Adapter real `MERCADO_PAGO` implementado sobre la API de preapprovals y el
  SDK oficial 3.2.0; OAuth de vendedores continúa fuera de alcance.
- Ruta firmada implementada en `/api/billing/mercado-pago/webhook`, cerrada con
  404 mientras producción use `MERCADO_PAGO_MOCK`.
- El tenant, plan, seats, moneda y monto se resuelven desde el nuevo
  `BillingCheckoutAttempt`; una notificación no puede elegir organización.
- Credencial TEST validada mediante una consulta read-only, sin imprimir
  identidad ni token. No se crearon suscripciones ni cobros externos.
- Pendientes externos: comprador de prueba separado y secreto de webhook de una
  URL HTTPS de staging. El smoke create/get/cancel/get quedó automatizado pero
  fail-closed hasta contar con ambos.
- Producción permanece en provider mock y `live=false`; no se accedió al VPS.

## Actualización sandbox posterior — 2026-07-12

- Comprador separado `@testuser.com` configurado localmente; el valor no se
  imprimió ni se versionó.
- El primer create fue rechazado correctamente porque ARS 10 estaba por debajo
  del mínimo vigente de ARS 15. El smoke se corrigió a ARS 100.
- Con el importe válido, Mercado Pago devolvió HTTP 500 después de los
  reintentos del SDK. La búsqueda autoritativa por comprador funcionó y confirmó
  cero preapprovals smoke activas; no hubo suscripción ni cobro pendiente.
- El script ahora sanitiza errores del proveedor y limpia de forma verificable
  sólo recursos con reason y external reference propios del smoke.
- Checkout público, provider productivo y `live` permanecen deshabilitados.

### Diagnóstico definitivo del HTTP 500

- El comprador actualizado cumple el formato sandbox y la búsqueda de
  preapprovals continúa en cero.
- `GET /users/me` con la credencial TEST confirmó sitio `MLA`, país `AR`, email
  confirmado y cuenta activa; no se registraron identificadores ni datos
  personales.
- Mercado Pago informa `billing.allow=false` con código `address_pending` para
  la identidad vendedora. Éste es el bloqueo previo a crear Preapproval y
  explica el HTTP 500 del sandbox.
- Acción humana pendiente: completar/validar la dirección de facturación de la
  cuenta vendedora en Mercado Pago. Después se repite el smoke reversible.
- Cero suscripciones smoke activas; checkout y live siguen deshabilitados.

## Actualización — 2026-07-13 01:51 UTC: vendedor de prueba en vez de KYC real

El titular avanzó la inscripción real de Monotributo en ARCA para destrabar
`address_pending` y llegó hasta ver la cuota real (Categoría A, ~$42.387/mes +
~$9.845/mes de componente provincial/municipal). Decisión tomada: **no activar
el compromiso impositivo real solo para destrabar un smoke test**. El trámite
de ARCA queda a criterio del titular para cuando Pulso facture de verdad; no
se completó ni se abandonó, simplemente no se usa como bloqueante del smoke.

En su lugar se creó una **cuenta vendedora de prueba (Test User)** de Mercado
Pago, identidad 100% sintética sin CUIT/condición fiscal real:

- Cuenta de prueba: "Pulso vendedor de prueba" (rol Vendedor), User ID
  `3535802823`, creada dentro de la app real "Pulso Suscripciones"
  (`2297043642763609`) desde Developers → Cuentas de prueba.
- Dentro de esa identidad de prueba se creó una aplicación propia, "Pulso
  vendedor prueba app" (número `7468104067183669`), integración Suscripciones.
- Su Access Token (prefijo `APP_USR-`, es la particularidad de MP: dentro de un
  Test User las credenciales "de producción" de esa identidad ficticia actúan
  como credenciales de sandbox) quedó guardado en `.env` como
  `MERCADO_PAGO_TEST_SELLER_ACCESS_TOKEN`. Placeholder agregado en
  `.env.example`.
- Nota operativa: iniciar sesión como este Test User reemplaza la sesión de
  Mercado Pago en **todas las pestañas del navegador** (cookies por dominio).
  El titular deberá volver a loguearse con su cuenta real cuando lo necesite.

**Pendiente para GPT Sol**: adaptar `scripts/smoke-mercado-pago-sandbox.ts`
(y cualquier lugar que use `MERCADO_PAGO_ACCESS_TOKEN` para el smoke) a usar
`MERCADO_PAGO_TEST_SELLER_ACCESS_TOKEN` en su lugar. El comprador de prueba ya
usado sigue siendo válido; falta crear o confirmar que exista también su
propio par vendedor-comprador dentro de la misma identidad de prueba si el SDK
lo requiere (Mercado Pago exige que comprador y vendedor de un mismo test
scenario sean cuentas de prueba distintas del mismo país). Con esto, el flujo
create → get → cancel → get debería completarse sin tocar KYC/fiscal real.

### Resultado de adaptación

- El smoke usa exclusivamente `MERCADO_PAGO_TEST_SELLER_ACCESS_TOKEN`; no tiene
  fallback al token de la cuenta real y aborta si ambos valores coinciden.
- Preflight de `/users/me`: vendedor sintético `MLA/AR`, activo,
  `billing.allow=true` y `sell.allow=true`. No se registraron datos personales.
- Mercado Pago volvió a responder HTTP 500 al crear la preapproval y la
  limpieza autoritativa confirmó cero smokes activos.
- La documentación oficial exige Vendedor y Comprador distintos y del mismo
  país; no publica un requisito de pertenecer a la misma aplicación. Para
  eliminar una incompatibilidad no documentada del sandbox, el próximo intento
  debe usar un Comprador AR recién creado desde el mismo contexto de cuentas de
  prueba del nuevo escenario vendedor.
- Checkout, provider live y credenciales reales permanecen fuera del smoke.

## Actualización — 2026-07-13 15:27 UTC: comprador de prueba nuevo del mismo escenario

Se creó el Comprador AR solicitado, desde el mismo contexto (app real "Pulso
Suscripciones" → Cuentas de prueba, junto al vendedor sintético):

- Cuenta de prueba: "Pulso comprador vendedor" (rol Comprador), User ID
  `3540407110`, Argentina.
- Email de la cuenta (dato público de la propia consola, no secreto):
  `test_user_9135926678895695499@testuser.com`. Confirmado dos veces —
  primero derivado del patrón `TESTUSER<n>` → `test_user_<n>@testuser.com`
  (ya observado con el vendedor sintético) y después verificado directamente
  en "Tu perfil" tras iniciar sesión como esa identidad.
- `.env` actualizado: `MERCADO_PAGO_TEST_PAYER_EMAIL` (no es secreto; valor
  público de una identidad 100% sintética, pero igual no se commitea).
- El comprador anterior (`comprador suscriptor`, usado en smokes previos)
  sigue existiendo y sigue siendo válido; este nuevo comprador es
  específicamente el pedido para descartar una incompatibilidad no
  documentada entre el vendedor sintético nuevo y el comprador viejo.

**Pendiente para GPT Sol**: reintentar el flujo `create → get → cancel → get`
con `MERCADO_PAGO_TEST_SELLER_ACCESS_TOKEN` + el nuevo
`MERCADO_PAGO_TEST_PAYER_EMAIL`.

Nota operativa: iniciar sesión como una cuenta de prueba reemplaza la sesión
de Mercado Pago en todas las pestañas del navegador (cookies por dominio); el
titular volvió a loguearse con su cuenta real después de este paso.

### Resultado del smoke con el comprador nuevo

- El flujo reversible `create → get → cancel → get` completó correctamente
  usando exclusivamente `MERCADO_PAGO_TEST_SELLER_ACCESS_TOKEN` y el nuevo
  `MERCADO_PAGO_TEST_PAYER_EMAIL`.
- La verificación final de limpieza encontró cero suscripciones smoke activas
  o huérfanas.
- No se usó la cuenta real, no se generó un cobro y no se habilitaron checkout
  ni provider live en producción.
- El resultado confirma que el HTTP 500 anterior estaba asociado al escenario
  de cuentas de prueba previo, no al contrato create/get/cancel del SDK.

## Actualización — 2026-07-13: Gemini prepago habilitado

- El proyecto de Google AI usado por Pulso figura como `Tier 1 · Prepay`; no se
  registraron ni versionaron la API key ni datos de facturación.
- Se ejecutó una única generación sintética con
  `gemini-3.1-flash-lite`, el reconocimiento explícito
  `paid-service-no-training` y sin datos de usuarios.
- El smoke respondió con contenido no vacío en 900 ms.
- La habilitación productiva de Personal AI sigue cerrada por feature flag,
  allowlist de emails y configuración server-side; este smoke no abrió acceso
  público ni activó cobros.
