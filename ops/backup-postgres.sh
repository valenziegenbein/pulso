#!/bin/sh
set -eu
umask 077

: "${DATABASE_URL:?Falta DATABASE_URL}"
: "${AGE_RECIPIENT:?Falta AGE_RECIPIENT (clave pública age)}"
BACKUP_DIR=${BACKUP_DIR:-./backups}

for tool in pg_dump psql age sha256sum; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Falta herramienta requerida: $tool" >&2; exit 1; }
done

mkdir -p "$BACKUP_DIR"
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
base="pulso-$timestamp"
dump_plain="$tmp_dir/$base.dump"
manifest_plain="$tmp_dir/$base.manifest"
dump_encrypted="$tmp_dir/$base.dump.age"
manifest_encrypted="$tmp_dir/$base.manifest.age"
checksum_file="$tmp_dir/$base.sha256"

echo "Creando dump PostgreSQL consistente..."
pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  --file="$dump_plain"

migrations=$(psql "$DATABASE_URL" -Atc \
  "SELECT coalesce(string_agg(migration_name, ',' ORDER BY migration_name), 'none') FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")
revision=${PULSO_IMAGE_REVISION:-unknown}
dump_bytes=$(wc -c < "$dump_plain" | tr -d ' ')
pg_version=$(pg_dump --version | tr '\n' ' ')

{
  echo "created_at_utc=$timestamp"
  echo "format=postgresql-custom"
  echo "compression=pg_dump-level-9"
  echo "dump_bytes=$dump_bytes"
  echo "image_revision=$revision"
  echo "migrations=$migrations"
  echo "pg_dump_version=$pg_version"
} > "$manifest_plain"

echo "Cifrando dump y manifiesto con age..."
age --recipient "$AGE_RECIPIENT" --output "$dump_encrypted" "$dump_plain"
age --recipient "$AGE_RECIPIENT" --output "$manifest_encrypted" "$manifest_plain"

(
  cd "$tmp_dir"
  sha256sum "$(basename "$dump_encrypted")" "$(basename "$manifest_encrypted")" > "$(basename "$checksum_file")"
  sha256sum --check "$(basename "$checksum_file")"
)

mv "$dump_encrypted" "$manifest_encrypted" "$checksum_file" "$BACKUP_DIR/"
echo "Backup cifrado listo en $BACKUP_DIR/$base.*"
echo "No se realizó ninguna copia externa. Usar upload-backup.sh sólo con autorización explícita."
