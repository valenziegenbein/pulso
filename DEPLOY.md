# Desplegar Pulso Web/Server

Este documento resume el flujo seguro. Los procedimientos completos están en:

- `docs/operations/MIGRATIONS.md`;
- `docs/operations/BACKUP_RESTORE.md`;
- `docs/operations/DEPLOY_ROLLBACK.md`.

## Estado de superficies públicas

En producción permanecen cerrados:

- `/register`;
- `/api/personal/*`.

Hay dos defensas: feature flags fail-closed en la aplicación y respuestas 404
en Caddy. No habilitarlas durante el sprint de migraciones.

## Requisitos

- Docker y Docker Compose v2;
- imagen Pulso construida una sola vez y promovida por digest real;
- PostgreSQL 16;
- dominio TLS;
- secretos fuera del repositorio;
- backup externo cifrado y restauración ensayada.

Los digests de las imágenes base fueron resueltos desde Docker Hub y están
versionados en Dockerfile/Compose. Su procedencia y actualización se documentan
en `docs/operations/DEPLOY_ROLLBACK.md`.

## Configuración

Copiar `.env.docker.example` a `.env` y completar localmente:

- `POSTGRES_PASSWORD`;
- `AUTH_SECRET`;
- `WORKLOG_ENCRYPTION_KEY`;
- `DOMAIN`;
- `PULSO_IMAGE` con referencia inmutable;
- allowlists LLM si corresponden.

Las URLs LLM públicas adicionales requieren coincidencia exacta en
`LLM_ALLOWED_PUBLIC_HOSTS`. Cualquier URL privada requiere coincidencia exacta
en `LLM_ALLOWED_PRIVATE_HOSTS`. Loopback, link-local y metadata continúan
bloqueados aunque se intenten allowlistear.

## Flujo obligatorio

1. Ejecutar `pnpm green` localmente.
2. Construir imagen versionada desde un worktree limpio.
3. Probar esa misma imagen en un entorno efímero/staging.
4. Crear backup cifrado, checksum y copia externa.
5. Restaurar la copia en una base aislada y ejecutar smoke.
6. Registrar digest actual y digest candidato.
7. Ejecutar la migración como job previo:

   ```sh
   docker compose --profile ops run --rm migrate
   ```

8. Si la migración fue exitosa, promover app y Caddy sin reconstruir:

   ```sh
   docker compose up -d --no-build app caddy
   ```

9. Ejecutar `ops/smoke.sh` y verificaciones autenticadas.

La aplicación normal no ejecuta migraciones durante el arranque. Producción
usa exclusivamente `prisma migrate deploy`; `prisma db push` y el seed están
prohibidos.

## Health y readiness

- `/api/health`: liveness del proceso;
- `/api/readiness`: conexión real con PostgreSQL;
- el healthcheck del contenedor y la dependencia de Caddy usan readiness.

Una base inaccesible deja la aplicación en estado no-ready y evita promover el
proxy hacia una instancia fallida.

## IA por organización

Proveedores oficiales usan HTTPS. Endpoints OpenAI-compatible adicionales deben
estar allowlisteados explícitamente. Una URL privada accesible desde Docker no
queda autorizada sólo por ser alcanzable.

## Seeds

No se reseedea producción. `packages/database/prisma/seed.ts` aborta con
`NODE_ENV=production`. Los fixtures de integración son sintéticos y sólo se
aplican al PostgreSQL efímero.

## Rollback

Para cambios backward-compatible, volver al digest anterior y ejecutar smoke.
Para un schema incompatible, restaurar el backup en una base nueva, validar y
cambiar la conexión. Prisma no ofrece down migrations automáticas.
