#!/bin/sh
set -eu

if [ "${PULSO_DEPLOY_APPROVED:-}" != "yes" ]; then
  echo "Deploy bloqueado: requiere PULSO_DEPLOY_APPROVED=yes." >&2
  exit 1
fi
: "${PULSO_IMAGE:?Falta PULSO_IMAGE por digest}"
: "${PREVIOUS_IMAGE:?Falta PREVIOUS_IMAGE para rollback}"
: "${VERIFIED_BACKUP_CHECKSUM:?Falta VERIFIED_BACKUP_CHECKSUM}"
: "${SMOKE_BASE_URL:?Falta SMOKE_BASE_URL}"

case "$PULSO_IMAGE" in *@sha256:*) ;; *) echo "PULSO_IMAGE debe ser una referencia real por digest." >&2; exit 1 ;; esac
case "$PREVIOUS_IMAGE" in *@sha256:*) ;; *) echo "PREVIOUS_IMAGE debe ser una referencia real por digest." >&2; exit 1 ;; esac
[ -f "$VERIFIED_BACKUP_CHECKSUM" ] || { echo "No existe el checksum del backup verificado." >&2; exit 1; }
command -v sha256sum >/dev/null 2>&1 || { echo "Falta sha256sum" >&2; exit 1; }

(
  cd "$(dirname "$VERIFIED_BACKUP_CHECKSUM")"
  sha256sum --check "$(basename "$VERIFIED_BACKUP_CHECKSUM")"
)

docker pull "$PULSO_IMAGE"
docker image inspect "$PULSO_IMAGE" >/dev/null
echo "Ejecutando migración previa con la misma imagen que se promoverá..."
docker compose --profile ops run --rm migrate

echo "Promoviendo imagen inmutable..."
docker compose up -d --no-build app
docker compose up -d --no-build caddy
SMOKE_BASE_URL="$SMOKE_BASE_URL" sh ./ops/smoke.sh

echo "Deploy verificado. Conservar PREVIOUS_IMAGE=$PREVIOUS_IMAGE y el backup hasta cerrar la ventana de observación."
