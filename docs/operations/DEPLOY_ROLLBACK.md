# Build, deploy y rollback inmutables

Los scripts están preparados pero bloqueados por confirmaciones explícitas. No
autorizan staging ni producción.

## Build reproducible

`pnpm install --frozen-lockfile` fija dependencias JS. Las imágenes base están
fijadas con digests reales resueltos desde Docker Hub el 2026-07-11:

- `node:22-bookworm-slim` → `sha256:53ada149d435c38b14476cb57e4a7da73c15595aba79bd6971b547ceb6d018bf`;
- `postgres:16` → `sha256:be01cf82fc7dbba824acf0a82e150b4b360f3ff93c6631d7844af431e841a95c`;
- `caddy:2` → `sha256:af5fdcd76f2db5e4e974ee92f96ee8c0fc3edb55bd4ba5032547cbf3f65e486d`.

Se obtuvieron con `docker pull <imagen:tag>` y la línea `Digest:` devuelta por
el registry. Para actualizarlas se debe repetir ese proceso, revisar release
notes, ejecutar el gate completo y cambiar digest en un commit aislado.

Con worktree limpio y versionado:

```sh
PULSO_IMAGE_REPOSITORY='<registry-autorizado>/pulso' \
node scripts/build-immutable-image.mjs
```

El script etiqueta con el Git SHA completo y añade la label OCI de revisión. El
digest distribuible sólo existe después de un push autorizado al registry.

## Staging o entorno efímero

1. Promover exactamente la imagen por digest.
2. Restaurar sólo fixture sintético o backup sanitizado/autorizado.
3. Ejecutar job `migrate`.
4. Levantar app y Caddy.
5. Ejecutar `SMOKE_BASE_URL=https://... sh ./ops/smoke.sh`.
6. Ejecutar pruebas autenticadas/cross-tenant por separado sin guardar claves.

## Producción

`ops/deploy.sh` exige:

- `PULSO_DEPLOY_APPROVED=yes`;
- imagen nueva por digest;
- imagen anterior por digest;
- checksum de backup verificado;
- URL de smoke.

Ejemplo documental, no ejecutar sin autorización:

```sh
PULSO_DEPLOY_APPROVED=yes \
PULSO_IMAGE='<registry>/pulso@sha256:<digest-nuevo-real>' \
PREVIOUS_IMAGE='<registry>/pulso@sha256:<digest-anterior-real>' \
VERIFIED_BACKUP_CHECKSUM='/backups/pulso-....sha256' \
SMOKE_BASE_URL='https://pulso.example' \
sh ./ops/deploy.sh
```

El orden es migrate → app → Caddy → smoke. Los bloqueos de Caddy permanecen
como defensa adicional.

## Rollback

Confirmar primero compatibilidad del schema. Luego:

```sh
PULSO_ROLLBACK_APPROVED=yes \
PREVIOUS_IMAGE='<registry>/pulso@sha256:<digest-anterior-real>' \
SMOKE_BASE_URL='https://pulso.example' \
sh ./ops/rollback.sh
```

Si el schema no es backward-compatible, usar restauración en DB nueva según
`BACKUP_RESTORE.md`, validar y recién entonces cambiar la conexión.

## Logs y fallos

- El arranque registra revisión y puerto, nunca secretos.
- Un fallo de conexión mantiene readiness en 503.
- Un fallo de migración detiene el job y bloquea promoción.
- Caddy espera que la app esté healthy mediante readiness.
- Conservar backup, imagen anterior y manifest hasta cerrar la observación.

## Checkpoint productivo 2026-07-11

- Compose: `/opt/pulso/docker-compose.yml`.
- Caddy compartido: `/opt/account/deploy/caddy/edge.prod.Caddyfile`; no fue
  modificado durante la promoción.
- Imagen activa:
  `docker.io/valenziegenbein/pulso-app@sha256:ccb32ed56d8f9d381675196de7c9a342b67f9d3e4d58ef82fdc177b6d2bc6ab6`.
- El VPS la referencia por el mismo image ID `sha256:ccb32ed...` con
  `pull_policy: never`, porque no almacena credenciales del registry.
- Rollback inmediato: `pulso-rollback:ed73a67e266515d3`.
- Compose/commit previos y manifest:
  `/var/backups/pulso/deploy-20260711T234734Z`.
- Archivo portable rollback verificado en VPS y
  `F:\Pulso-backups\rollback-images\pulso-image-rollback-ed73a67e266515d3`.

Para rollback autorizado: restaurar `docker-compose.before.yml` y
`DEPLOYED_COMMIT.before`, ejecutar `docker compose up -d --no-build app`, esperar
estado running y repetir `ops/smoke.sh`. No recrear `pulso-db`.

## Checkpoint productivo P5 — 2026-07-12

- Backup cifrado y restaurado: `pulso-20260712T203025Z`; copia verificada en
  `F:\Pulso-backups\verified\pulso-20260712T203025Z`.
- Checkpoint remoto: `/var/backups/pulso/deploy-20260712T204705Z-p5`.
- Imagen activa y worker:
  `sha256:87e22dd3eb21bb529d8774b409af4d0ca3bd2eb944fbfed68c21f6c5d779238a`.
- Digest de registry equivalente:
  `docker.io/valenziegenbein/pulso-app@sha256:87e22dd3eb21bb529d8774b409af4d0ca3bd2eb944fbfed68c21f6c5d779238a`.
- Rollback inmediato: `pulso-rollback:p5-20260712T204705Z` y archivos
  `docker-compose.before.yml` / `env.before` dentro del checkpoint.
- Schema: siete migraciones aplicadas; cambios aditivos verificados contra el
  backup restaurado. El rollback de aplicación no revierte automáticamente DB.
