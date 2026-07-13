# Runbook de credenciales externas — Mercado Pago y Google/Gmail

Sin secretos. Última actualización: 2026-07-12 (UTC).

## Dónde viven las credenciales

- Local (desarrollo): `F:\Pulso-codex\.env`, ignorado por Git.
  Verificación obligatoria antes de escribir: `git check-ignore -v .env`.
- No hay secret store dedicado todavía; si el programa adopta uno (p. ej.
  SOPS/age, ya usado para backups), migrar estos valores y actualizar este
  runbook.
- Producción/VPS: fuera de alcance; los despliegues usan el mecanismo de
  compose/entorno del runbook de deploy, nunca este archivo.

## Nombres de variables

| Variable | Estado | Fuente |
| --- | --- | --- |
| `MERCADO_PAGO_ACCESS_TOKEN` | Completa (TEST) | MP Developers → app "Pulso Suscripciones" (cuenta real del titular) → Credenciales de prueba |
| `MERCADO_PAGO_TEST_SELLER_ACCESS_TOKEN` | Completa (`APP_USR-`) | Test User "Pulso vendedor de prueba" (identidad 100% sintética, sin KYC/fiscal real) → app "Pulso vendedor prueba app" → Credenciales de producción de esa identidad. Preferir esta variable para smokes de suscripciones: evita bloqueos KYC de la cuenta real |
| `MERCADO_PAGO_CLIENT_ID` / `MERCADO_PAGO_CLIENT_SECRET` | Vacías | Reservadas en `.env.example`; obtener de la consola si el adapter las requiere |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Vacía | La genera MP al guardar la URL del webhook (endpoint aún inexistente) |
| `GOOGLE_GMAIL_CLIENT_ID` / `GOOGLE_GMAIL_CLIENT_SECRET` | Completas localmente | GCP proyecto `pulso-email-sender` → Auth Platform → Clients → "Pulso Gmail Sender (server)" |
| `GOOGLE_GMAIL_REFRESH_TOKEN_ENCRYPTED` | Vacía | Pendiente de consentimiento; debe contener sólo el token cifrado AES-GCM |
| `GOOGLE_GMAIL_SENDER` | Completa (no secreta) | Casilla remitente de prueba |

El worker se ejecuta una vez con `pnpm email:worker:once`. En producción exige
`PULSO_EMAIL_PROVIDER=GMAIL_OAUTH`; el valor `MOCK` aborta de forma explícita.
No guardar nunca un refresh token en claro: se cifra con
`WORKLOG_ENCRYPTION_KEY` antes de incorporarlo al secret store del entorno.

## Bootstrap OAuth local

1. Agregar exactamente `http://127.0.0.1:53682/oauth/callback` a los redirect
   URIs autorizados del cliente web en Google Cloud.
2. Verificar que `.env` contiene client ID, client secret, sender y
   `WORKLOG_ENCRYPTION_KEY`.
3. Ejecutar `pnpm email:oauth:configure`. El script abre el navegador del
   sistema (no un webview), solicita sólo `gmail.send`, valida `state`, bloquea
   redirects en el intercambio y escribe el refresh token ya cifrado en `.env`.
4. Confirmar únicamente presencia de `GOOGLE_GMAIL_REFRESH_TOKEN_ENCRYPTED`;
   nunca imprimir ni copiar su valor.

Este paso requiere consentimiento personal del titular. No ejecutar desde CI.

El smoke end-to-end usa `pnpm email:smoke:outbox` y está triplemente bloqueado:
requiere el ACK literal documentado en el script, `DATABASE_URL` idéntica a
`TEST_DATABASE_URL` y PostgreSQL loopback con base `pulso_email_smoke`. Nunca
apuntarlo a una base persistente; destruir el contenedor/volumen al terminar.

## Sandbox vs producción

- Mercado Pago: las credenciales de prueba empiezan con `TEST-`; las
  productivas (`APP_USR-…`) **no están activadas** y requieren datos de
  negocio + activación explícita en la consola. Nunca mezclar: el entorno se
  decide por la variable, no por código condicional.
- Google: la app OAuth está en modo **Testing** (solo test users, refresh
  tokens de testing caducan a los ~7 días — suficiente para desarrollo).
  Publicar la app y verificar marca/dominio es un paso productivo separado
  (checkpoint L5).

## Rotación

- Mercado Pago: Developers → aplicación → Credenciales (prueba o producción)
  → renovar/regenerar. Actualizar `.env` inmediatamente; las credenciales
  viejas dejan de valer.
- Google: Auth Platform → Clients → cliente → "Add secret" permite crear un
  secret nuevo y deshabilitar el anterior sin cortar el servicio (rotación en
  dos pasos). Tras rotar, revocar el secret viejo y actualizar `.env`.
- Tras cualquier rotación, re-ejecutar la validación de configuración y los
  smokes que existan.

## Revocación

- Mercado Pago: regenerar credenciales desde la consola invalida las
  anteriores; en incidentes, además pausar la aplicación.
- Google: deshabilitar/eliminar el secret comprometido en el cliente OAuth;
  si el refresh token existiera, revocarlo desde
  https://myaccount.google.com/permissions (cuenta remitente) y regenerarlo.
- En ambos casos: buscar usos residuales, actualizar `.env`, documentar el
  incidente en `docs/program/EVIDENCE.md`.

## Cómo validar que no están en Git

```
cd F:\Pulso-codex
git check-ignore -v .env            # debe resolver a la regla .gitignore:13
git status --short                  # .env no debe aparecer
git diff -- .env.example            # solo placeholders vacíos
git grep -nE "TEST-|GOCSPX-" -- .   # sin resultados en archivos versionados
```

Nunca imprimir el valor completo de una credencial en terminal, logs, tests,
documentación ni capturas. Para confirmar una credencial alcanza con
presencia/ausencia y, si es imprescindible, su prefijo estándar (`TEST-`,
`GOCSPX-`).

## Pasos productivos que siguen bloqueados

- Activar credenciales productivas de Mercado Pago y cualquier cobro real.
- Configurar webhooks (hasta tener endpoint + URL de pruebas).
- Publicar la app OAuth de Google, verificación de marca/dominio.
- Obtener y cifrar el refresh token del remitente (requiere consentimiento interactivo).
- Enviar emails reales.
- Todo lo anterior requiere checkpoint L5 explícito del titular.

## Mercado Pago P6: sandbox y promoción controlada

El adapter real usa `POST /preapproval` sin plan externo: el monto mensual ARS
proviene de una versión interna y el `external_reference` apunta a un
`BillingCheckoutAttempt` persistido. El webhook nunca acepta organización,
plan, seats o monto desde el cliente ni desde el cuerpo de la notificación:
verifica HMAC, consulta `GET /preapproval/{id}` y compara el recurso con el
intento guardado antes de conceder entitlements.

Variables nuevas:

- `MERCADO_PAGO_MODE=TEST` exige token `TEST-`.
- `MERCADO_PAGO_MODE=PRODUCTION` exige token `APP_USR-` y además
  `PULSO_MERCADO_PAGO_LIVE_ENABLED=true`.
- `PULSO_BILLING_PROVIDER` sigue en `MERCADO_PAGO_MOCK` por defecto, también
  dentro del contenedor productivo.
- `PULSO_MERCADO_PAGO_CHECKOUT_ENABLED=true` es un segundo opt-in sólo para
  sandbox; permanece `false` en producción hasta implementar repricing mes 13.
- `MERCADO_PAGO_WEBHOOK_SECRET` debe existir antes de mostrar checkout.

El smoke reversible es `pnpm billing:smoke:sandbox`. Exige un comprador de
prueba `@testuser.com`, el token `APP_USR-` del vendedor sintético en
`MERCADO_PAGO_TEST_SELLER_ACCESS_TOKEN`, retorno HTTPS y el ACK literal definido
en el script. No existe fallback al token de la cuenta real;
crea una preapproval mínima de ARS 100, la consulta, la cancela y vuelve a
consultarla. Antes y después busca por comprador y cancela exclusivamente
smokes huérfanos identificados por reason y external reference. No usar una
cuenta real ni la misma identidad vendedora. Mercado
Pago requiere al menos vendedor y comprador de prueba separados y del mismo
país. La documentación oficial no exige que pertenezcan a la misma aplicación.

Endpoint implementado: `POST /api/billing/mercado-pago/webhook`. Permanece 404
mientras el provider sea mock, limita el body a 64 KiB incluso con transferencia
chunked y sólo acepta `subscription_preapproval` firmado. La URL pública y el
secreto deben configurarse en un staging HTTPS antes del primer checkout real.

La promoción sigue este orden: crear comprador sandbox → publicar staging por
digest → configurar URL/secreto de prueba → ejecutar firma simulada → ejecutar
smoke create/cancel → autorizar manualmente una suscripción de prueba → comprobar
webhook e idempotencia → recién entonces evaluar credenciales productivas.
