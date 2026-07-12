# Evidencia del programa

No contiene secretos, URLs reales, datos productivos ni credenciales.

## Baseline P0.5 — 2026-07-11

### Git

- Rama: `codex/web-control-plane-hardening`
- HEAD: `e8ac1cf6d98c2163abf6bdcabbceab88b9bc9220`
- Commits operativos del programa: 8
- Índice: vacío
- `git diff --check`: exit 0
- Cambio ajeno preservado: `README.md` eliminado + `README pulso.md` idéntico y untracked
- `F:\Pulso`: limpio, `main`, HEAD `be54fd85a7f666360dfc9d234f50df37790a5ad3`

### Green gate

Comando:

```text
pnpm green
```

Resultado final: exit 0.

El gate se repitió después de crear los ocho commits operativos. Un primer
intento se detuvo antes de PostgreSQL porque Docker Desktop estaba apagado; se
inició el daemon local y la repetición completa terminó con exit 0.

| Componente | Resultado |
| --- | --- |
| Typecheck global | 5 tasks exitosas |
| Tests unitarios/servicio | 14 archivos, 55 tests |
| PostgreSQL DB-backed | 1 archivo, 9 tests |
| Upgrade sintético | 1 archivo, 3 tests |
| Lint | 5 tasks exitosas |
| Web build | Next 15.5.19, 27 páginas generadas |
| Electron security check | OK |
| Production safety check | OK |
| `git diff --check` | OK |

Total de tests ejecutados por el gate: 67.

### PostgreSQL y migraciones

- Imagen: PostgreSQL 16 por digest real.
- Datos: exclusivamente sintéticos.
- Almacenamiento: tmpfs efímero.
- Migraciones encontradas/aplicadas desde cero: 2.
- `prisma migrate status`: up to date.
- Drift migraciones ↔ `schema.prisma`: no difference detected.
- Upgrade ensayado: migración inicial marcada como aplicada y migración `org_plans` aplicada después.
- Conteos antes/después: `1,2,2,1,1,2` para organización, usuarios, membresías, equipo, tarea, worklogs.
- Contenedores/red de integración eliminados al finalizar.

### Build y configuración

- Build Docker local: exit 0 con tag descartable `pulso:local-validation`.
- Revisión del build: `uncommitted-local-validation`, explícitamente no promocionable.
- Imagen local de validación eliminada después de inspeccionarla.
- Build inmutable post-commit desde worktree limpio `a6e2a0a`: exit 0.
- Tag local: `pulso:a6e2a0ab55cd0a71ca669aaaa8625c2508cf55ec`.
- Image ID local: `sha256:cdc6d4218ae6347c6a63b91d5c9d4c861e8eedec2b869362cbfdc5d48cd1f295`.
- La imagen y el worktree temporal fueron eliminados; no hubo push.
- Caddyfile: `caddy validate` exitoso.
- Compose producción e integración: config válida.
- Scripts shell: sintaxis válida.
- Scripts backup/upload/retention/restore/deploy/rollback: abortan sin aprobación/configuración.

### Digests base resueltos desde Docker Hub

- Node: `sha256:53ada149d435c38b14476cb57e4a7da73c15595aba79bd6971b547ceb6d018bf`
- PostgreSQL: `sha256:be01cf82fc7dbba824acf0a82e150b4b360f3ff93c6631d7844af431e841a95c`
- Caddy: `sha256:af5fdcd76f2db5e4e974ee92f96ee8c0fc3edb55bd4ba5032547cbf3f65e486d`

### Incidentes locales durante construcción del gate

1. Node 25/Windows rechazó `spawn` directo de `pnpm.cmd` (`EINVAL`).
   - Corrección: invocar el mismo `pnpm.cjs` mediante `process.execPath`.
   - Datos afectados: ninguno; DB efímera eliminada.
2. Vitest raíz no resolvía workspaces `@pulso/*`.
   - Corrección: aliases explícitos en configs de integración/upgrade.
   - Resultado posterior: 9/9 y 3/3.
3. Primer gate post-commit encontró Docker Desktop apagado.
   - Corrección: iniciar el daemon local y repetir el gate completo.
   - Resultado posterior: exit 0; no se crearon datos persistentes.

### Commits operativos

- `f703a86` test LLM
- `4218594` autorización/multi-tenant
- `ea8a5f7` superficies cerradas/SSRF
- `abdb5eb` hardening HTTP
- `cf88bf0` aislamiento Electron
- `59ee460` PostgreSQL/migraciones
- `99f07b3` backup/restore/migration job
- `a6e2a0a` deploy/rollback inmutable

### Warnings visibles, no ocultados

- Vite CJS Node API deprecada.
- npm advierte sobre `node-linker` como config desconocida.
- Prisma/pnpm informan versiones nuevas disponibles; no se actualizaron.
- Los tests de constraints imprimen errores Prisma esperados `P2002/P2003`; las aserciones los validan.

## Evidencia aún inexistente

- Staging, smokes remotos y producción.
- Ventana de observación post-deploy.

## Backup cifrado y restore temporal en F — 2026-07-11

- Capacidad libre observada: aproximadamente 908 GiB.
- Directorio reservado: `F:\Pulso-backups`.
- Subdirectorios: `incoming`, `verified`, `restore-tests`.
- Bundle: `pulso-20260711T162936Z`.
- Artefactos transferidos: dump y manifiesto cifrados con age + SHA-256.
- Dump plano persistente en `F:`: ninguno.
- Identidad age: existente fuera del repo, ACL restringida; nunca copiada al VPS.
- Checksum remoto y local: OK.
- Restore: PostgreSQL 16 efímero, sin puertos ni red, destino vacío.
- Conteos restaurados: 2 organizaciones, 6 usuarios, 6 membresías, 4 equipos,
  6 tareas y 1 worklog.
- Inconsistencias organización/equipo/tarea/worklog/rol detectadas: 0.
- Migraciones terminadas y no revertidas restauradas: 2.
- Contenedor, volumen, identidad temporal, dump y manifiesto planos: eliminados.
- Estado post-operación del VPS: `pulso-db` healthy; `pulso-app` running.
- ACL de `F:\Pulso-backups`: sólo usuario actual, SYSTEM y Administradores.
- Verificador local preparado: `ops/verify-backup-bundle.ps1`.
- El verificador exige cabecera age v1 y SHA-256 antes de copiar a `verified`.

## Comparación productiva de migraciones — 2026-07-11

- Acceso: consulta PostgreSQL en transacción `READ ONLY` dentro de `pulso-db`.
- Filas productivas: 2; filas locales: 2.
- `20260624213924_init`: finalizada, activa, 1 paso, checksum local/productivo
  `e59699068fea924132a8e04332a07f923643d862f38fd20eb762c5a8a8584c8e`.
- `20260625010000_org_plans`: finalizada, activa, 1 paso, checksum
  local/productivo
  `4f377ebdb8b45df0709f6f5b5d0be5c0b80c2de0c4839821ebb116fa3c56d8ac`.
- Migraciones extra, faltantes, duplicadas, inconclusas o revertidas: 0.
- Escrituras, migraciones, restart y cambios de contenedor: ninguno.

## Imagen inmutable registrada — 2026-07-11

- Registry/repository: `docker.io/valenziegenbein/pulso-app`, privado.
- Git SHA: `974514256817c7ae02824e2d08ab1b728bf08659`.
- Tag único publicado:
  `docker.io/valenziegenbein/pulso-app:974514256817c7ae02824e2d08ab1b728bf08659`.
- Digest distribuible del índice:
  `docker.io/valenziegenbein/pulso-app@sha256:e4b0c1223612375def6dfebdca948348f46bc2fcb5c60afe3957c69d208bb69d`.
- Manifest `linux/amd64`:
  `sha256:caad8510a43dc136453575d520ac3733b2c72d49eea3c61545f4f1b9da77f787`.
- Image ID local de build: `sha256:e4b0c1223612375def6dfebdca948348f46bc2fcb5c60afe3957c69d208bb69d`.
- Build: una ejecución desde worktree detached limpio; worktree retirado.
- Green gate anterior al push: exit 0; 55 unitarios/servicio, 9 PostgreSQL y
  3 upgrade, typecheck, lint, build, Electron y production safety.
- Push autenticado: exit 0; digest informado por Docker coincide con registry.
- Verificación: referencia local por tag eliminada, pull por digest ejecutado y
  label OCI `org.opencontainers.image.revision` igual al Git SHA.
- `latest`: no creado ni publicado.
- Docker Hub muestra repositorio privado, un único tag y tamaño comprimido
  aproximado de 782,5 MB.

## Incidente de staging efímero — 2026-07-11

- Entorno: Compose local aislado, datos sintéticos, proxy en loopback; sin VPS.
- Imagen: digest `sha256:e4b0c1223612375def6dfebdca948348f46bc2fcb5c60afe3957c69d208bb69d`.
- Migration job: 2 migraciones aplicadas correctamente desde base vacía.
- Fixture sintético: carga completa exit 0.
- App: Next.js 15.5.19 inició y registró `Ready` con la revisión esperada.
- Healthcheck: permaneció `starting` y luego `unhealthy`; smoke no ejecutado.
- Prueba directa dentro del contenedor: `127.0.0.1` produjo `TypeError`; el
  hostname del contenedor respondió HTTP 200 en `/api/readiness`.
- Causa: la rama standalone de `docker-entrypoint.sh` no fuerza bind
  `0.0.0.0`; el healthcheck consulta loopback.
- Limpieza: contenedores, red, volumen, fixture y secretos efímeros eliminados.
- Producción/VPS, Caddy público y datos reales: no accedidos.

## Corrección y staging verde — 2026-07-11

- Fix commit: `14bf70a64d2316a34f8010e16f931c49cbc0b82d`.
- Cambio: la rama standalone exporta `HOSTNAME=0.0.0.0` antes de iniciar Next.
- Guard: production-safety falla si el bind explícito desaparece.
- Green gate del fix: exit 0; 55 unitarios/servicio, 9 PostgreSQL, 3 upgrade,
  typecheck, lint, build, Electron y production safety.
- Tag corregido:
  `docker.io/valenziegenbein/pulso-app:14bf70a64d2316a34f8010e16f931c49cbc0b82d`.
- Digest corregido:
  `docker.io/valenziegenbein/pulso-app@sha256:ccb32ed56d8f9d381675196de7c9a342b67f9d3e4d58ef82fdc177b6d2bc6ab6`.
- Manifest `linux/amd64`:
  `sha256:98c56d289553ea1c4b4bbd2034f70a2a00f113187ea3eb2a46ae96064e5fafbe`.
- Pull por digest y label OCI de revisión: verificados.
- Staging: Compose efímero local, datos exclusivamente sintéticos y exposición
  sólo en `127.0.0.1:43100`.
- Migration job: 2 migraciones aplicadas desde base vacía.
- Conteos `(org,user,membership,team,task,worklog,migrations)`:
  `1,2,2,1,1,2,2`.
- DB, app y Caddy: healthy.
- `ops/smoke.sh`: `Smoke público: OK`; health/readiness y bloqueos de registro
  y Personal verificados.
- Logs: revisión esperada presente; sin marcadores de secretos ni URLs DB.
- Cleanup: cero contenedores, redes, volúmenes, fixtures o secretos temporales.
- Imagen anterior `sha256:e4b0c122...` conservada en registry y no promovida.

## Producción P0.5 — 2026-07-11

- URL: `https://pulso.syswarm.com`.
- Baseline previo: `/api/health` y `/api/readiness` devolvían 404; registro y
  Personal ya devolvían 404 por Caddy.
- Candidata canónica:
  `docker.io/valenziegenbein/pulso-app@sha256:ccb32ed56d8f9d381675196de7c9a342b67f9d3e4d58ef82fdc177b6d2bc6ab6`.
- Transporte: `docker save` verificado, sin token Docker Hub en el VPS; image ID
  cargado `sha256:ccb32ed56d8f9d381675196de7c9a342b67f9d3e4d58ef82fdc177b6d2bc6ab6`.
- Rollback productivo previo: image ID
  `sha256:ed73a67e266515d3fae1ce5c916beceebf897cd5744b0e906d4c1161077711f4`,
  tag local `pulso-rollback:ed73a67e266515d3`.
- Archivo rollback en VPS y `F:`: 817.066.863 bytes, SHA-256
  `6cc7581c0e42c51fac03e90f80713c6dcf283053845344fb0f05edd9684b0fdf`.
- Backup DB cifrado: checksum remoto/local y restore previo verificados.
- Primer intento de promoción: abortó por quoting del chequeo de conteos; trap
  restauró compose/commit anteriores bit a bit antes de migrar o recrear app.
- Promoción definitiva: migration job informó `No pending migrations to apply`.
- Invariantes productivas antes/después: 2 organizaciones y 2 migraciones.
- Contenedor `pulso-db`: mismo ID durante la promoción; nunca recreado.
- `pulso-app`: image ID candidato, revisión
  `14bf70a64d2316a34f8010e16f931c49cbc0b82d`, health `healthy`.
- Feature flags productivas: registro `false`, Personal API `false`.
- Caddy compartido: no modificado; bloqueos adicionales permanecen.
- Smoke público inicial y final: OK; health/readiness 200, request ID/headers y
  bloqueos 404 verificados.
- Observación: 6 muestras cada ~30 s entre 23:48:47Z y 23:51:30Z; readiness 200
  y app/DB healthy en todas.
- Logs: 0 errores, sin marcadores sensibles.
- Otros sistemas: sin contenedores unhealthy/restarting; sólo jobs históricos
  terminados con exit 0.
- Disco VPS post-deploy: 18 GiB / 96 GiB (19%).
- Rollback manifest: `/var/backups/pulso/deploy-20260711T234734Z`, checksum OK.

## P1 — Integridad relacional PostgreSQL local — 2026-07-12

- Commit operativo: `06058d4b88d546bc568f0e960a31a34004ff9fb1`.
- Migración: `20260712030000_tenant_relational_integrity`.
- Cambios: `TeamMembership.organizationId`, backfill desde `Team`, índices y FKs
  compuestas para roles, membresías, equipos, tareas, decisiones y adjuntos.
- Preflight: valida filas históricas antes de reemplazar constraints; todo el
  archivo usa una única transacción explícita.
- `prisma validate`: schema válido.
- Typecheck global: 5 paquetes, exit 0.
- `pnpm test:db`: exit 0.
- Migraciones desde base vacía: 3/3 aplicadas.
- `prisma migrate status`: schema actualizado.
- Drift migraciones ↔ schema: ninguno.
- Suite PostgreSQL: 12/12 tests; incluye cruces de rol/equipo/organización,
  recursos cross-tenant y carrera concurrente de membresía.
- Upgrade sintético: 3/3 tests; conteos `1,2,2,1,1,2` preservados y
  `TeamMembership.organizationId` derivado correctamente.
- Ensayo negativo: fixture cross-tenant rechazado por `migrate deploy`; la
  columna nueva no quedó creada, confirmando rollback transaccional.
- Datos utilizados: exclusivamente sintéticos bajo `integration.invalid`.
- VPS, staging remoto y producción: no accedidos durante este bloque.

## P1 — Candidata inmutable y staging sintético — 2026-07-12

- Fixture actual versionado: commit
  `5bf0b9ca67d9895a47b918a4908bf816d1022e0c`.
- Build: worktree detached limpio en `F:`, luego eliminado.
- Imagen local:
  `pulso-p1-staging:5bf0b9ca67d9895a47b918a4908bf816d1022e0c`.
- Image ID local:
  `sha256:0c25ee6f7282c58e8b73db3ab87d2cd9e0b704eacbec49e7ef15d789bf56a5a0`.
- Tamaño informado por Docker: 820.558.946 bytes.
- Label OCI revision: coincide exactamente con el Git SHA.
- Registry/push/tag `latest`: ninguno.
- Staging: red Docker aislada, PostgreSQL 16 en `tmpfs`, secretos y datos
  exclusivamente sintéticos, Caddy publicado sólo en `127.0.0.1:43100`.
- Migration job: 3/3 migraciones aplicadas desde base vacía.
- Conteos `(org,user,orgMembership,teamMembership,team,task,worklog,migrations)`:
  `1,2,2,1,1,1,2,3`.
- App readiness: OK.
- Smoke público: health/readiness OK; request ID, nosniff y CSP presentes;
  `/register` y `/api/personal/suggest` devolvieron 404.
- Logs: sin connection strings, nombres de secretos, errores fatales ni errores
  de inicialización Prisma.
- Incidentes del harness: tres corridas previas aplicaron migraciones pero el
  verificador local falló por escaping SQL, ausencia de `.State.Health` al usar
  `docker run` y parsing de headers/labels en PowerShell. Ninguno fue un fallo
  de la candidata; cada entorno se eliminó antes de repetir desde base vacía.
- Cleanup final: sin contenedores, redes, DB, fixture ni secretos temporales;
  sólo se conserva la imagen local reproducible.
