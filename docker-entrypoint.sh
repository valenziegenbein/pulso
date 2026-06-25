#!/bin/sh
# Arranque del contenedor de Pulso: aplica migraciones pendientes y arranca el server.
set -e

echo "Esperando a la base y aplicando migraciones (prisma migrate deploy)..."
pnpm --filter @pulso/database run migrate:deploy

echo "Iniciando Pulso en 0.0.0.0:${PORT:-3000}"
if [ -f "apps/web/.next/standalone/apps/web/server.js" ]; then
  exec node apps/web/.next/standalone/apps/web/server.js
fi

exec pnpm --filter web exec next start -H 0.0.0.0 -p "${PORT:-3000}"
