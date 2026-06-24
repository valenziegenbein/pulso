# Desplegar Pulso Web/Server

Stack de produccion: **Next.js server + PostgreSQL**, en Docker. La web/server
es el panel de control: login/register, organizaciones, equipos, miembros,
tareas, resumen, administracion, planes/seats y lectura/gestion de bitacora.

Pulso Desktop sigue siendo la superficie diaria de trabajo: onboarding, widget,
capturas manuales, avances, exportaciones y flujo cotidiano.

## 1. Requisitos

- VPS o servidor con Docker y Docker Compose v2.
- Dominio apuntando al servidor.
- Reverse proxy con TLS delante del puerto de la app (Caddy, Nginx o Traefik).

Pulso escucha HTTP dentro del host; TLS termina en el proxy.

## 2. Configurar entorno

```bash
git clone <repo> pulso && cd pulso
cp .env.docker.example .env
```

Edita `.env`:

```bash
# Genera cada secreto por separado, 32 bytes hex:
openssl rand -hex 32   # AUTH_SECRET
openssl rand -hex 32   # WORKLOG_ENCRYPTION_KEY
```

Variables principales:

- `POSTGRES_PASSWORD`: password fuerte para Postgres.
- `AUTH_SECRET`: secreto de sesion/auth, 64 caracteres hex.
- `WORKLOG_ENCRYPTION_KEY`: clave AES para secretos LLM, 64 caracteres hex.
- `APP_PORT`: puerto host que expones detras del proxy.

No configures `LLM_*` para el server. En produccion la IA se configura por
organizacion desde **Admin -> IA de la organizacion**.

## 3. Levantar

```bash
docker compose up -d --build
docker compose logs -f app
```

El contenedor `app` ejecuta `prisma migrate deploy` antes de arrancar Next.
Los datos persisten en el volumen `pulso-db-data`.

## 4. Crear organizaciones

La ruta publica `/register` crea una organizacion nueva, su primer `ORG_ADMIN`,
roles base y un equipo inicial.

Tambien podes crear un tenant inicial por CLI:

```bash
docker compose run --rm \
  -e ORG_NAME="Acme" -e ORG_SLUG="acme" -e PLAN_KEY="FREE" \
  -e ADMIN_NAME="Nombre del Jefe" -e ADMIN_EMAIL="jefe@acme.com" -e ADMIN_PASSWORD="..." \
  -e MEMBER_NAME="Tu Nombre" -e MEMBER_EMAIL="vos@acme.com" -e MEMBER_PASSWORD="..." \
  -e TEAM_NAME="Direccion" \
  app pnpm --filter @pulso/database tenant
```

Planes internos actuales, sin cobro real:

- `FREE`: 5 seats.
- `TEAM`: 15 seats.
- `BUSINESS`: 50 seats.

El limite se guarda en la organizacion y se valida al anadir miembros.

## 5. IA por organizacion

Un `ORG_ADMIN` configura el proveedor desde **Admin -> IA de la organizacion**:

- `MOCK`: sin API key, fallback seguro.
- `OPENAI_COMPATIBLE`: OpenAI, LM Studio, vLLM u otro endpoint compatible.
- `ANTHROPIC`: Anthropic.

La API key se cifra con `WORKLOG_ENCRYPTION_KEY` y no vuelve al cliente. Si no
hay config activa, Pulso usa resumen heuristico y sugerencias mock/fallback.

Para LM Studio, el `baseUrl` debe ser alcanzable desde el servidor, no desde el
navegador. En Docker Desktop suele ser:

```text
http://host.docker.internal:1234/v1
```

## 6. Operacion

Actualizar:

```bash
git pull
docker compose up -d --build
```

Backup:

```bash
docker compose exec db pg_dump -U pulso pulso > pulso-$(date +%F).sql
```

Restore:

```bash
cat backup.sql | docker compose exec -T db psql -U pulso -d pulso
```

Migraciones manuales, si hacen falta:

```bash
docker compose run --rm app pnpm --filter @pulso/database run migrate:deploy
```

## Notas

- Multi-tenant: las escrituras validan entidad + `organizationId` y scope del rol.
- Privacidad: no hay mouse tracking, keylogging, tiempo activo ni capturas automaticas.
- Web/server no reemplaza Desktop: el widget y la captura cotidiana viven en la app.
- Billing real queda pendiente; por ahora solo existen plan y seats internos.
