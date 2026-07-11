#!/bin/sh
set -eu

echo "Aplicando migraciones revision=${PULSO_IMAGE_REVISION:-unknown} con prisma migrate deploy"
pnpm --filter @pulso/database run migrate:deploy
echo "Migraciones aplicadas correctamente"
