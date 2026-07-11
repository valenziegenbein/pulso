#!/bin/sh
# Arranque del contenedor de Pulso. Las migraciones se ejecutan antes como job separado.
set -e

echo "Iniciando Pulso revision=${PULSO_IMAGE_REVISION:-unknown} en 0.0.0.0:${PORT:-3000}"
if [ -f "apps/web/.next/standalone/apps/web/server.js" ]; then
  exec node apps/web/.next/standalone/apps/web/server.js
fi

exec pnpm --filter web exec next start -H 0.0.0.0 -p "${PORT:-3000}"
