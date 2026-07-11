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

## Aplicación

La migración es un job previo, no un efecto secundario del arranque:

```sh
PULSO_IMAGE='<registry>/pulso@sha256:<digest-real>' \
docker compose --profile ops run --rm migrate
```

Si falla, no ejecutar `docker compose up` para la nueva aplicación. Conservar la
versión actual y diagnosticar sobre logs sanitizados.

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
