# Separación marketing / SaaS

Estado preparado el 2026-07-12:

- `pulso.syswarm.com` continúa apuntando a `pulso-app` hasta completar DNS.
- `app.syswarm.com` ya está configurado en Caddy hacia `pulso-app`.
- `pulso-marketing` está levantado y saludable en `account_default`, sin ruta pública todavía.
- `www.syswarm.com` pertenece al sistema de cuentas y no debe reutilizarse.

## Artefactos activos/preparados

- SaaS: `docker.io/valenziegenbein/pulso-app@sha256:2c0069b86e873f0c5ac48ca0bee1c7a123154d018cf7f5258640acf49febb6d9`
- Marketing: `docker.io/valenziegenbein/pulso-marketing@sha256:c781725d786b8a9752848a0eca59dc8e51a23bac504e342ed23440b4484c7b57`
- Backup post-migración: `pulso-20260712T231709Z` (cifrado con age y verificado en `F:`).

## Activación pendiente de DNS

1. Crear en Cloudflare un registro `A` para `app.syswarm.com` hacia `2.25.184.183`, proxied, TTL Auto.
2. Verificar por Cloudflare: readiness 200, login 200, registro 404 y Personal API 404.
3. Cambiar `PULSO_APP_URL` a `https://app.syswarm.com` y recrear app/worker si corresponde.
4. En el host `pulso.syswarm.com`, enrutar exclusivamente `/api/contact` a `pulso-app:3000` y el resto a `pulso-marketing:3000`.
5. Validar y recrear el contenedor edge para refrescar el bind mount del Caddyfile.
6. Verificar home, pricing, CSP, redirect de `/login`, contacto, readiness del SaaS y bloqueos P0.

No activar checkout de Mercado Pago durante este cambio. El comprador sandbox debe ser una cuenta de prueba separada, nunca una cuenta real.

## Rollback

Si falla marketing, restaurar el Caddyfile `pre-domain-split` y recrear `account-edge-1`; esto devuelve `pulso.syswarm.com` a `pulso-app`. Mantener `app.syswarm.com` como alias no altera datos. Para rollback del SaaS, restaurar el compose `pre-p7` y la imagen anterior `sha256:87e22dd3eb21bb529d8774b409af4d0ca3bd2eb944fbfed68c21f6c5d779238a`. La migración 8 es aditiva y no debe revertirse destructivamente.
