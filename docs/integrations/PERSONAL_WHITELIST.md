# Whitelist de Pulso Personal

## Alcance del primer corte

Personal conserva cuatro opciones de IA:

1. `Con mi cuenta Pulso`: IA administrada, sólo para cuentas incluidas en la
   whitelist cerrada.
2. `API key propia`: BYOK local al equipo de la persona.
3. `IA local`: Ollama o LM Studio en loopback.
4. `Sin IA`: captura y bitácora manuales.

Este corte **no representa todavía una suscripción paga**. No crea un plan
Personal ficticio, no reutiliza seats de Teams y no habilita Mercado Pago. La
whitelist permite validar activación, calidad, latencia y consumo antes de
crear el entitlement comercial por usuario.

## Arquitectura de confianza

- Personal sigue ejecutándose en el server local embebido de Electron.
- La autorización de cuenta usa el PKCE Desktop ya existente y abre el
  navegador del sistema. Electron guarda la cookie `httpOnly` únicamente en la
  partición persistente `persist:pulso-teams`.
- El renderer Personal invoca un IPC mínimo. El proceso main usa
  `Session.fetch()` contra la ruta fija `/api/desktop/personal-ai` del origen
  configurado; no acepta una URL remota desde el renderer.
- El endpoint remoto deriva el usuario de la sesión y exige coincidencia exacta
  contra `PULSO_PERSONAL_ACCOUNT_AI_ALLOWED_EMAILS`.
- Host, modelo y API key de Gemini se resuelven en el servidor. Ninguno vuelve
  al Desktop ni puede ser reemplazado por el cliente.
- `/api/personal/*` permanece bloqueado en producción; el endpoint autenticado
  Desktop no depende de esa superficie pública.
- Los borradores generados nunca se publican automáticamente.

## Configuración

```dotenv
PULSO_PERSONAL_ACCOUNT_AI_ENABLED=false
PULSO_PERSONAL_ACCOUNT_AI_ALLOWED_EMAILS=persona1@example.com,persona2@example.com
PULSO_PERSONAL_ACCOUNT_AI_GEMINI_API_KEY=<secret>
PULSO_PERSONAL_ACCOUNT_AI_DATA_TERMS_ACK=paid-service-no-training
PULSO_PERSONAL_ACCOUNT_AI_MODEL=gemini-3.1-flash-lite
PULSO_PERSONAL_ACCOUNT_AI_RATE_LIMIT=20
PULSO_PERSONAL_ACCOUNT_AI_RATE_WINDOW_MS=60000
```

Reglas:

- habilitar la feature sólo después de cargar una allowlist no vacía y la key;
- verificar en AI Studio que el proyecto de la key figura como `Paid`. En Free
  Tier Google puede usar prompts, respuestas e imágenes para mejorar productos
  y advierte que no se envíe información sensible o confidencial. El backend
  exige el ACK literal `paid-service-no-training` para impedir que una key free
  se habilite por accidente;
- agregar emails normalizados, separados por coma; no usar dominios comodín;
- custodiar la key sólo en el secret store o `.env` ignorado del servidor;
- mantener un límite de ráfaga compatible con la cuota real de Gemini;
- no copiar la key a `pulso.defaults.json`, al instalador o al renderer.

Referencias oficiales: [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms)
y [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing?hl=en).

## Smoke de whitelist

El smoke mínimo de proveedor requiere la key en el entorno y un ACK de una sola
generación. No imprime prompt, respuesta ni credencial:

```powershell
$env:PULSO_PERSONAL_ACCOUNT_AI_SMOKE_ACK='one-managed-generation'
pnpm personal-ai:smoke
```

1. Confirmar `https://pulsoapp.syswarm.com/api/readiness` en verde.
2. Instalar un build Desktop de prueba cuyo default sea
   `https://pulsoapp.syswarm.com`.
3. En onboarding o Ajustes, elegir `Con mi cuenta Pulso`.
4. Autorizar el dispositivo desde el navegador con una cuenta allowlisted.
5. Confirmar `Cuenta conectada · acceso Personal AI habilitado`.
6. Generar un borrador desde texto y otro desde una captura manual.
7. Editar y aprobar uno; descartar el otro. Verificar que nada se publique solo.
8. Crear una tarea asistida.
9. Probar una cuenta autenticada fuera de la lista: debe ver que espera acceso y
   recibir 403 al intentar generar.
10. Superar deliberadamente el límite sólo en un entorno controlado: debe
    responder 429 sin filtrar credenciales ni contenido.

## Pendientes antes de cobrar Personal AI

- suscripción y entitlement por **usuario**, independientes de Organization y
  seats;
- cuota durable mensual expresada como entradas/créditos, con ledger e
  idempotencia;
- medición de input/output tokens, latencia, reintentos y costo sin guardar
  prompts, capturas ni contenido de bitácora;
- checkout Mercado Pago Personal y webhooks que activen/revoquen el entitlement;
- tratamiento de trial, cancelación, reembolso e impuestos;
- límite compartido entre réplicas (no sólo rate limit en memoria);
- evaluación de calidad y presupuesto antes de cargar créditos pagos.

No publicar el instalador ni habilitar esta feature en producción sin una
allowlist explícita y un smoke del build firmado o de prueba autorizado.
