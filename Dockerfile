# Pulso — imagen de producción (server Next + Postgres vía DATABASE_URL).
# Imagen "completa" a propósito: incluye el toolchain para correr `migrate deploy`
# y el script de provisión de tenants sin pasos extra. (Optimizar a multi-stage
# slim es un follow-up; para el primer deploy priorizamos robustez.)
FROM node:22-bookworm-slim@sha256:53ada149d435c38b14476cb57e4a7da73c15595aba79bd6971b547ceb6d018bf

ARG PULSO_GIT_SHA=unknown
LABEL org.opencontainers.image.revision=$PULSO_GIT_SHA

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

# Next no copia `public` ni `.next/static` al output standalone. El server
# generado resuelve ambos desde su propio directorio; sin esta copia el HTML
# carga, pero todos los estilos y assets responden 404.
RUN mkdir -p apps/web/.next/standalone/apps/web/.next \
  && cp -R apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static \
  && if [ -d apps/web/public ]; then cp -R apps/web/public apps/web/.next/standalone/apps/web/public; fi \
  && test -n "$(find apps/web/.next/standalone/apps/web/.next/static -type f -print -quit)"

ENV NODE_ENV=production
ENV PORT=3000
ENV PULSO_IMAGE_REVISION=$PULSO_GIT_SHA
EXPOSE 3000

# Las migraciones se ejecutan mediante docker-migrate.sh antes de promover la app.
RUN chmod +x docker-entrypoint.sh docker-migrate.sh
CMD ["./docker-entrypoint.sh"]
