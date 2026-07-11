#!/bin/sh
set -eu

if [ "${PULSO_ROLLBACK_APPROVED:-}" != "yes" ]; then
  echo "Rollback bloqueado: requiere PULSO_ROLLBACK_APPROVED=yes." >&2
  exit 1
fi
: "${PREVIOUS_IMAGE:?Falta PREVIOUS_IMAGE por digest}"
: "${SMOKE_BASE_URL:?Falta SMOKE_BASE_URL}"
case "$PREVIOUS_IMAGE" in *@sha256:*) ;; *) echo "PREVIOUS_IMAGE debe ser una referencia real por digest." >&2; exit 1 ;; esac

docker pull "$PREVIOUS_IMAGE"
docker image inspect "$PREVIOUS_IMAGE" >/dev/null
PULSO_IMAGE="$PREVIOUS_IMAGE" docker compose up -d --no-build app
PULSO_IMAGE="$PREVIOUS_IMAGE" docker compose up -d --no-build caddy
SMOKE_BASE_URL="$SMOKE_BASE_URL" sh ./ops/smoke.sh
echo "Rollback de aplicación verificado. Si el schema no era backward-compatible, restaurar en una DB nueva según el runbook."
