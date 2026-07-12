# Backup externo y restauración

Los scripts preparan el flujo, pero ningún upload está autorizado por defecto.
Nunca se guardan dumps sin cifrar fuera de un directorio temporal con permisos
restrictivos.

## Destino temporal autorizado

Hasta disponer de un segundo servidor o proveedor, el destino fuera del VPS es:

```text
F:\Pulso-backups
```

Estructura local:

- `incoming`: recepción temporal de un bundle ya cifrado;
- `verified`: bundles que pasaron SHA-256 y validación de cabecera age;
- `restore-tests`: restauraciones aisladas, nunca datos activos.

`F:` reduce el riesgo de perder VPS y backup a la vez, pero no sustituye una
copia offsite duradera. No se permite guardar allí `.sql` ni `.dump` planos.

Después de una transferencia autorizada, verificar y copiar el bundle:

```powershell
powershell -File .\ops\verify-backup-bundle.ps1 `
  -BundleDirectory 'F:\Pulso-backups\incoming\pulso-<UTC>' `
  -DestinationRoot 'F:\Pulso-backups' `
  -CopyToVerified
```

## Requisitos

- cliente PostgreSQL 16 (`pg_dump`, `pg_restore`, `psql`);
- `age`;
- `sha256sum`;
- para copia externa, `rclone` y un destino autorizado;
- clave pública age en el host de backup;
- clave privada age fuera del VPS.

## Crear backup local cifrado

```sh
export DATABASE_URL='postgresql://...'
export AGE_RECIPIENT='age1...clave-publica...'
export BACKUP_DIR=/var/backups/pulso
export PULSO_IMAGE_REVISION='<git-sha>'
sh ./ops/backup-postgres.sh
```

Si PostgreSQL corre en el mismo Docker host y el cliente no está instalado en
el host, el script puede usar las herramientas de PostgreSQL 16 del contenedor:

```sh
AGE_RECIPIENT='age1...' \
BACKUP_DIR=/var/backups/pulso \
PULSO_POSTGRES_CONTAINER=pulso-db \
PULSO_POSTGRES_USER=pulso \
PULSO_POSTGRES_DB=pulso \
sh ./ops/backup-postgres.sh
```

Este modo usa el socket local del contenedor y no necesita exponer ni imprimir
la contraseña de la base.

Produce un set:

- `pulso-<UTC>.dump.age`;
- `pulso-<UTC>.manifest.age`;
- `pulso-<UTC>.sha256`.

El dump usa el snapshot consistente de `pg_dump`, formato custom, compresión 9,
sin ownership ni ACL. El manifiesto registra versión, migraciones, revisión y
tamaño. El checksum cubre únicamente artefactos cifrados.

## Upload externo bloqueado

Sólo después de definir proveedor, credenciales, clave pública y autorización:

```sh
export BACKUP_UPLOAD_APPROVED=yes
export BACKUP_DIR=/var/backups/pulso
export RCLONE_DESTINATION='remote-autorizado:pulso'
sh ./ops/upload-backup.sh
```

El script usa `rclone copy` seguido de `rclone check`. Nunca incluye dumps
planos. En el estado actual no debe ejecutarse.

## Retención

Política provisional sugerida: 14 diarios, 8 semanales y 12 mensuales. El script
local sólo implementa poda por antigüedad y protege un mínimo de sets. Debe
ejecutarse exclusivamente después de verificar la copia externa:

```sh
BACKUP_RETENTION_CONFIRMED=yes \
BACKUP_DIR=/var/backups/pulso \
RETENTION_DAYS=14 \
MIN_BACKUP_SETS=3 \
sh ./ops/prune-backups.sh
```

La política GFS definitiva queda pendiente del destino elegido.

## Restauración aislada

Crear primero una base vacía cuyo nombre empiece con `pulso_restore_`. El script
rechaza bases no vacías y destinos remotos salvo autorización adicional.

```sh
RESTORE_CONFIRM_ISOLATED=yes \
RESTORE_DATABASE_URL='postgresql://.../pulso_restore_20260711' \
BACKUP_FILE='/backups/pulso-....dump.age' \
MANIFEST_FILE='/backups/pulso-....manifest.age' \
CHECKSUM_FILE='/backups/pulso-....sha256' \
AGE_IDENTITY='/ruta-segura/identity.txt' \
sh ./ops/restore-postgres.sh
```

Después del restore:

1. verificar migraciones y conteos;
2. ejecutar `pnpm test:db` contra su propio entorno efímero;
3. levantar una app aislada contra la restauración;
4. ejecutar `ops/smoke.sh`;
5. documentar fecha, checksum y resultado.

Nunca restaurar directamente sobre la base activa. Para recuperación real,
restaurar en una base/volumen nuevo y cambiar la aplicación sólo después de
validar.
