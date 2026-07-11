#!/bin/sh
set -eu

if [ "${BACKUP_RETENTION_CONFIRMED:-}" != "yes" ]; then
  echo "Retención bloqueada: requiere BACKUP_RETENTION_CONFIRMED=yes después de verificar la copia externa." >&2
  exit 1
fi
: "${BACKUP_DIR:?Falta BACKUP_DIR}"
RETENTION_DAYS=${RETENTION_DAYS:-14}
MIN_BACKUP_SETS=${MIN_BACKUP_SETS:-3}

case "$RETENTION_DAYS:$MIN_BACKUP_SETS" in
  *[!0-9:]*|'') echo "Retención inválida" >&2; exit 1 ;;
esac

set_count=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'pulso-*.sha256' | wc -l | tr -d ' ')
if [ "$set_count" -le "$MIN_BACKUP_SETS" ]; then
  echo "No se poda: sólo existen $set_count sets (mínimo protegido: $MIN_BACKUP_SETS)."
  exit 0
fi

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'pulso-*.sha256' -mtime "+$RETENTION_DAYS" -print | while read -r checksum; do
  remaining=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'pulso-*.sha256' | wc -l | tr -d ' ')
  [ "$remaining" -le "$MIN_BACKUP_SETS" ] && break
  base=${checksum%.sha256}
  rm -f -- "$base.dump.age" "$base.manifest.age" "$checksum"
done
