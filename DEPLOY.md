# Desplegar Pulso (Teams) en un servidor

Stack: **Next.js (server) + PostgreSQL**, en Docker. El modo Teams vive en el
servidor; el modo Personal sigue siendo local-first en el cliente.

## 1. Requisitos

- Un servidor (VPS) con **Docker** y **Docker Compose v2**.
- Un dominio apuntando al servidor + un reverse proxy con TLS (Caddy / Nginx /
  Traefik) delante del puerto de la app. Pulso habla HTTP en claro; el TLS lo
  termina el proxy.

## 2. Configurar

```bash
git clone <repo> pulso && cd pulso
cp .env.docker.example .env
```

Editá `.env`:

```bash
# Generá cada secreto por separado (32 bytes hex):
openssl rand -hex 32   # → AUTH_SECRET
openssl rand -hex 32   # → WORKLOG_ENCRYPTION_KEY
```

- `POSTGRES_PASSWORD`: una contraseña fuerte.
- `AUTH_SECRET` y `WORKLOG_ENCRYPTION_KEY`: 64 caracteres hex cada uno, distintos.
- `APP_PORT`: el puerto que va a escuchar el host (lo tapás con el proxy).
- IA (opcional): ver comentarios del `.env`. Sin IA, el pulso usa un resumen
  heurístico y las sugerencias el mock (no rompe nada).

## 3. Levantar

```bash
docker compose up -d --build
```

El contenedor `app` corre `prisma migrate deploy` (crea/actualiza el esquema) y
arranca el server. Seguí los logs:

```bash
docker compose logs -f app
```

## 4. Crear el primer tenant (org del jefe + vos)

Una sola vez. Las contraseñas las pasás vos (cambiables después del login):

```bash
docker compose run --rm \
  -e ORG_NAME="Acme" -e ORG_SLUG="acme" \
  -e ADMIN_NAME="Nombre del Jefe" -e ADMIN_EMAIL="jefe@acme.com" -e ADMIN_PASSWORD="..." \
  -e MEMBER_NAME="Tu Nombre" -e MEMBER_EMAIL="vos@acme.com" -e MEMBER_PASSWORD="..." \
  -e TEAM_NAME="Dirección" \
  app pnpm --filter @pulso/database tenant
```

- El admin queda como `ORG_ADMIN` (ve el dashboard de líder) y `TEAM_ADMIN` del
  equipo.
- El miembro (vos) queda en la org y en el equipo como `MEMBER`.
- Es idempotente: re-ejecutarlo actualiza, no duplica. Para sumar más gente,
  corré de nuevo con otros datos, o usá "Añadir miembro" desde la app.

## 5. Entrar

Abrí `https://tu-dominio` → login con las credenciales del paso 4.

## Operación

- **Actualizar**: `git pull && docker compose up -d --build`. Las migraciones
  nuevas se aplican solas al arrancar. **Tus datos persisten** (viven en el
  volumen `pulso-db-data`, no en la imagen).
- **Backup de la base**:
  ```bash
  docker compose exec db pg_dump -U pulso pulso > pulso-$(date +%F).sql
  ```
- **Restore**:
  ```bash
  cat backup.sql | docker compose exec -T db psql -U pulso -d pulso
  ```
- **Migraciones manuales** (si las necesitás): `docker compose run --rm app pnpm --filter @pulso/database run migrate:deploy`.

## Notas

- **Aislamiento multi-tenant**: todo cuelga de `organizationId` y las consultas
  filtran por la org del usuario logueado. Un usuario de una org no ve datos de
  otra.
- **No hay datos demo** en producción: el seed demo (`db:seed`) es solo para
  desarrollo; el deploy nunca lo corre.
- **IA del pulso**: en el servidor no hay un LLM local; configurá `LLM_*` para IA
  real, o quedate con el resumen heurístico.
