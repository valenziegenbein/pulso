# Separación marketing / SaaS

Estado promovido el 2026-07-13:

- `pulso.syswarm.com` sirve la landing y marketing desde `pulso-marketing`.
- `pulsoapp.syswarm.com` sirve el SaaS real desde `pulso-app`.
- `/api/contact` en marketing se enruta al backend y entrega mediante la outbox cifrada.
- `www.syswarm.com` pertenece al sistema de cuentas y no debe reutilizarse.

## Artefactos activos

- SaaS: `docker.io/valenziegenbein/pulso-app@sha256:a4806315b1cd89439b105575b2757ebdd559c3a0541b0f5f7d835756ef9459db`
- Marketing: `docker.io/valenziegenbein/pulso-marketing@sha256:838a049fcbb18d02a0c0f3e2b5eca0961ab1b2c2a3ce63defe3b886f1dd54e82`
- Backup previo a Personal-ready: `pulso-20260713T173548Z` (cifrado con age,
  checksum verificado y restaurado en PostgreSQL 16 desde la copia de `F:`).

## Verificación

1. Cloudflare resuelve `pulsoapp.syswarm.com` hacia el edge, con proxy activo.
2. En SaaS: readiness 200, login 200, registro 404 y Personal API 404.
3. `PULSO_APP_URL=https://pulsoapp.syswarm.com`; app saludable después de recrearla.
4. En marketing: home, pricing, contact, teams y health 200; `/app` 404 y `/login` redirige al SaaS canónico.
5. CSP presente, `X-Powered-By` ausente y Caddy válido.
6. Contacto sintético aceptado con 202 y procesado por la outbox con estado `SENT`.

Checkout de Mercado Pago permanece desactivado. El comprador sandbox debe ser una cuenta de prueba generada por Mercado Pago, nunca una cuenta real.

## Rollback

Si falla marketing, fijar nuevamente `docker.io/valenziegenbein/pulso-marketing@sha256:4778f4e0188bba1dd722cdd1b3200b2d09a5d97777522f1fe806a34f6d079948` en `/opt/pulso-marketing/docker-compose.yml` y recrear únicamente `pulso-marketing`. Si falla el routing, restaurar el Caddyfile `pre-pulsoapp` y recrear `account-edge-1`. Para rollback del SaaS, restaurar `docker-compose.before.yml` y `DEPLOYED_COMMIT.before` desde `/var/backups/pulso/deploy-20260713T175049Z-personal-ready`, y recrear sólo app y worker. La imagen anterior es `docker.io/valenziegenbein/pulso-app@sha256:2c0069b86e873f0c5ac48ca0bee1c7a123154d018cf7f5258640acf49febb6d9`; no hay cambio de schema que revertir.
