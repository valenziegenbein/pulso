# Pulso — imagen de producción (server Next + Postgres vía DATABASE_URL).
# Imagen "completa" a propósito: incluye el toolchain para correr `migrate deploy`
# y el script de provisión de tenants sin pasos extra. (Optimizar a multi-stage
# slim es un follow-up; para el primer deploy priorizamos robustez.)
FROM node:22-bookworm-slim

# openssl: requerido por el query engine de Prisma. ca-certificates: TLS salida.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

# Copiamos todo el monorepo (el .dockerignore excluye node_modules/.next/.env/etc.)
COPY . .

# Instala dependencias del workspace (node-linker=hoisted vía .npmrc).
RUN pnpm install --frozen-lockfile

# Cliente Prisma para esta plataforma (Debian/glibc) + build del server Next.
RUN pnpm --filter @pulso/database exec prisma generate \
  && pnpm --filter web build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Migra (idempotente) y arranca el server.
RUN chmod +x docker-entrypoint.sh
CMD ["./docker-entrypoint.sh"]
