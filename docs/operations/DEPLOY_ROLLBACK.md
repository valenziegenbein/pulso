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
