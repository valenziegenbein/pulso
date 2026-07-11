#!/bin/sh
set -eu
umask 077

if [ "${RESTORE_CONFIRM_ISOLATED:-}" != "yes" ]; then
  echo "Restore bloqueado: requiere RESTORE_CONFIRM_ISOLATED=yes." >&2
  exit 1
fi
: "${RESTORE_DATABASE_URL:?Falta RESTORE_DATABASE_URL}"
: "${BACKUP_FILE:?Falta BACKUP_FILE .dump.age}"
: "${MANIFEST_FILE:?Falta MANIFEST_FILE .manifest.age}"
: "${CHECKSUM_FILE:?Falta CHECKSUM_FILE .sha256}"
: "${AGE_IDENTITY:?Falta AGE_IDENTITY}"

for tool in pg_restore psql age sha256sum node; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Falta herramienta requerida: $tool" >&2; exit 1; }
done

RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" ALLOW_REMOTE_ISOLATED_RESTORE="${ALLOW_REMOTE_ISOLATED_RESTORE:-}" node - <<'NODE'
const url = new URL(process.env.RESTORE_DATABASE_URL);
const database = url.pathname.replace(/^\//, '');
const local = new Set(['127.0.0.1', 'localhost', '::1']).has(url.hostname);
if (!database.startsWith('pulso_restore_')) throw new Error('La base destino debe comenzar con pulso_restore_.');
if (!local && process.env.ALLOW_REMOTE_ISOLATED_RESTORE !== 'yes') throw new Error('Restore remoto bloqueado.');
NODE

backup_dir=$(CDPATH= cd -- "$(dirname -- "$BACKUP_FILE")" && pwd)
(
  cd "$backup_dir"
  sha256sum --check "$(basename "$CHECKSUM_FILE")"
)

table_count=$(psql "$RESTORE_DATABASE_URL" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
if [ "$table_count" != "0" ]; then
  echo "Restore bloqueado: la base aislada no está vacía ($table_count tablas)." >&2
  exit 1
fi

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM
age --decrypt --identity "$AGE_IDENTITY" --output "$tmp_dir/restore.dump" "$BACKUP_FILE"
age --decrypt --identity "$AGE_IDENTITY" --output "$tmp_dir/manifest.txt" "$MANIFEST_FILE"

pg_restore \
  --dbname="$RESTORE_DATABASE_URL" \
  --exit-on-error \
  --no-owner \
  --no-acl \
  "$tmp_dir/restore.dump"

echo "Restore aislado completado. Manifiesto verificado:"
sed -n '1,20p' "$tmp_dir/manifest.txt"
psql "$RESTORE_DATABASE_URL" -Atc \
  "SELECT 'organizations=' || count(*) FROM \"Organization\"; SELECT 'migrations=' || count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"
