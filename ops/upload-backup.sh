#!/bin/sh
set -eu

if [ "${BACKUP_UPLOAD_APPROVED:-}" != "yes" ]; then
  echo "Upload bloqueado: requiere BACKUP_UPLOAD_APPROVED=yes." >&2
  exit 1
fi
: "${BACKUP_DIR:?Falta BACKUP_DIR}"
: "${RCLONE_DESTINATION:?Falta RCLONE_DESTINATION autorizado}"
command -v rclone >/dev/null 2>&1 || { echo "Falta rclone" >&2; exit 1; }

echo "Copiando únicamente artefactos cifrados y checksums..."
rclone copy "$BACKUP_DIR" "$RCLONE_DESTINATION" \
  --include 'pulso-*.dump.age' \
  --include 'pulso-*.manifest.age' \
  --include 'pulso-*.sha256' \
  --exclude '*'
rclone check "$BACKUP_DIR" "$RCLONE_DESTINATION" \
  --download \
  --include 'pulso-*.dump.age' \
  --include 'pulso-*.manifest.age' \
  --include 'pulso-*.sha256' \
  --exclude '*'
echo "Upload y verificación remota completados."
