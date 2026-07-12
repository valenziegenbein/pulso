# Runbook de migraciones PostgreSQL

Producción usa exclusivamente `prisma migrate deploy`. `prisma db push` está
prohibido en scripts y contenedores productivos. El seed aborta cuando
`NODE_ENV=production`.

## Gate local desde cero

```sh
pnpm test:db
```

El runner:

1. levanta PostgreSQL 16 en `tmpfs`;
2. exige un destino local `pulso_test` con usuario sintético;
3. aplica todas las migraciones a una base vacía;
4. ejecuta `prisma migrate status`;
5. compara `prisma/migrations` contra `schema.prisma` usando una shadow DB;
6. ejecuta tests de seguridad reales sin mocks;
7. construye `pulso_upgrade` con la migración inicial y datos sintéticos;
8. registra la migración inicial, captura conteos y aplica migraciones pendientes;
9. comprueba conteos, relaciones, defaults, aislamiento y migration history;
10. elimina contenedores y `tmpfs`.

Desde `20260712030000_tenant_relational_integrity` el runner también crea una
tercera base con una relación cross-tenant deliberadamente inválida. El deploy
debe rechazarla y el test comprueba que la transacción no deja ni siquiera la
columna nueva. Esto valida el comportamiento fail-closed del preflight.

Desde `20260712050000_persisted_auth` se crea además una base histórica con dos
emails que sólo colisionan al normalizar mayúsculas/minúsculas. La migración auth
debe abortar y revertir todas sus columnas/tablas. Usuarios históricos válidos
reciben `normalizedEmail = lower(trim(email))` y `emailVerifiedAt = createdAt`.

`PULSO_KEEP_TEST_DB=1` puede conservarlo sólo para diagnóstico local.

## Antes de producción

1. Gate completamente verde.
2. Imagen inmutable probada en staging/efímero.
3. `prisma migrate status` sobre una restauración equivalente a producción.
4. Backup externo cifrado, checksum verificado y restore ensayado.
5. Registrar imagen actual, imagen nueva y digest anterior.
6. Revisar SQL de cada migración y clasificarla:
   - additive/backward-compatible;
   - requiere mantenimiento;
   - destructiva (no promover sin plan específico).

### Preflight de integridad tenant

La migración P1 deriva `TeamMembership.organizationId` desde el equipo y aborta
si encuentra cualquiera de estas condiciones:

- membresía organizacional con un rol de otra organización;
- membresía de equipo sin membresía organizacional equivalente;
- rol o equipo de otra organización en una membresía de equipo;
- tarea o decisión asociada a un equipo de otra organización;
- adjunto asociado a una tarea o bitácora de otra organización.

El backfill, los chequeos y el reemplazo de FKs están dentro de un único
`BEGIN/COMMIT`. Ante un fallo no corregir datos dentro de la migración: conservar
la versión activa, identificar las filas mediante consultas read-only, acordar
la corrección y repetir primero sobre una restauración aislada.

## Aplicación

La migración es un job previo, no un efecto secundario del arranque:

```sh
PULSO_IMAGE='<registry>/pulso@sha256:<digest-real>' \
docker compose --profile ops run --rm migrate
```

Si falla, no ejecutar `docker compose up` para la nueva aplicación. Conservar la
versión actual y diagnosticar sobre logs sanitizados.

Una migración fallida queda registrada por Prisma. Después de corregir la causa
en una copia aislada, marcarla como rolled back con `prisma migrate resolve
--rolled-back 20260712030000_tenant_relational_integrity` sólo en el entorno
afectado y volver a ejecutar `migrate deploy`. Nunca marcarla como aplicada si
el SQL no terminó.

La promoción de P2 invalida deliberadamente las cookies HMAC autocontenidas
anteriores: no se migran secretos de sesión. Todos los usuarios deben volver a
iniciar sesión para obtener una `AuthSession` opaca y revocable.

La migración P3 (`20260712070000_entitlements`) hace backfill de un owner y una
suscripción mock por organización existente. Su preflight rechaza planes
históricos desconocidos y organizaciones sin membresía elegible. Antes de
promoverla sobre una restauración productiva, comprobar explícitamente:

- exactamente una suscripción por organización;
- al menos un owner por organización;
- ninguna suscripción con `planKey` fuera del catálogo;
- conteos de usuarios, membresías, equipos, tareas y worklogs preservados;
- ledger vacío para organizaciones históricas, salvo carga aprobada aparte.

## Smoke y promoción

1. `/api/readiness` devuelve 200.
2. `/register` y `/api/personal/*` devuelven 404.
3. Login y selección de organización funcionan.
4. Pruebas negativas cross-tenant pasan.
5. Conteos e invariantes coinciden.
6. Recién entonces promover la aplicación.

## Rollback

Prisma no genera down migrations. Si el cambio es backward-compatible, volver
al digest anterior de aplicación. Si no lo es, restaurar el backup en una base
nueva y apuntar la aplicación anterior a esa base. Nunca improvisar SQL inverso
en producción.
