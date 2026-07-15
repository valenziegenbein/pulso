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

## P2 — Auth persistida, invitaciones y Desktop PKCE — 2026-07-12

- Commit principal: `919d556` — auth multi-org persistida.
- Fixture staging: `32d6822d6e10245dd4d555d5dd78e78fbf5e9f22`.
- Migración: `20260712050000_persisted_auth`, transaccional.
- Backfill: email normalizado, cuentas históricas verificadas y estado activo;
  preflight aborta ante duplicados case-insensitive.
- Modelos: `AuthSession`, `VerificationToken`, `PasswordResetToken`,
  `OrganizationInvite`, `DesktopAuthorizationCode`, `AuthRateLimitBucket`.
- Sesiones: token opaco de 256 bits, sólo hash SHA-256 en DB, revocación,
  expiración, dispositivo, organización activa y `securityVersion`.
- Flujos: login/logout, selección multi-org, verificación, forgot/reset, cambio
  de contraseña, sesiones activas, invitación de un uso y alta sólo por invite.
- Invitación pendiente: no crea membresía ni ocupa seat; aceptación transaccional.
- Rate limits: buckets persistidos con sujeto hasheado y aislamiento serializable.
- Desktop: navegador del sistema, S256 PKCE, state, loopback `127.0.0.1`, code de
  5 minutos/un uso, sesión dedicada `persist:pulso-teams`; preload remoto mínimo.
- Registro público: permanece 404. El sink mock no retiene ni loguea tokens.
- Green gate: exit 0; 55 unitarios, 24 PostgreSQL, 3 upgrade, cuatro migraciones,
  drift cero, dos preflights negativos, typecheck, lint, build Web (35 rutas),
  Electron security y production safety.
- Imagen local:
  `pulso-p2-staging:32d6822d6e10245dd4d555d5dd78e78fbf5e9f22`.
- Image ID:
  `sha256:1364b5e2f0091c3665d3dae8fdd4191e861356e7d93d1a5213e839b4d638a0fd`.
- Tamaño: 822.123.866 bytes; label OCI coincide con Git SHA; sin push/latest.
- Staging: PostgreSQL 16 tmpfs, cuatro migraciones, conteos
  `1,2,2,1,1,1,2,4`, readiness y headers OK.
- Sesión staging: cookie opaca aceptada por `/api/me`, acceso a seguridad 200,
  revocada en DB y rechazada inmediatamente después.
- Smokes: `/register` y Personal 404; forgot/signup 200; Desktop sin sesión 307;
  grant Desktop inválido 400; logs sin secretos ni errores fatales.
- Incidente harness: primer intento abortó antes de iniciar la app por API SHA-256
  no disponible en PowerShell; segunda corrida completa verde desde DB vacía.
- Cleanup: staging y worktree eliminados; imagen local conservada.

## P3 — Seats, ownership y entitlements — 2026-07-12

- Commit operativo: `ece7d4ff27d08035ed2f5cd1f858f1b3f45e2add`.
- Migración: `20260712070000_entitlements`, transaccional, con catálogo de
  planes, suscripción mock por organización, ownership y ledger de uso AI.
- Seats: sólo membresías `ACTIVE`/`SUSPENDED` consumen cupo; una invitación
  pendiente no lo consume. La aceptación serializa mediante lock de la fila de
  organización y rechaza la carrera que excedería el límite.
- Ownership: cada organización tiene owner explícito; no se puede remover ni
  degradar al último owner y la transferencia exige destino elegible.
- AI: consumo managed idempotente por clave; BYOK/local queda registrado sin
  cargar unidades managed. Los planes comerciales conservan cero unidades
  incluidas hasta que exista una decisión comercial explícita.
- Green gate: exit 0; 55 unitarios, 28 PostgreSQL, 3 upgrade, cinco migraciones,
  drift cero, typecheck, lint, build Web (35 rutas), Electron security,
  production safety y `git diff --check`.
- Build limpio: worktree detached temporal en `F:`, eliminado al finalizar.
- Imagen local:
  `pulso-p3-staging:ece7d4ff27d08035ed2f5cd1f858f1b3f45e2add`.
- Image ID:
  `sha256:2e3d4f1a6d33a8408338768ee6075673a9f361108f5e5c11902edef1060797f8`.
- Label OCI revision: coincide exactamente con el Git SHA; sin push ni `latest`.
- Staging: PostgreSQL 16 en `tmpfs`, red Docker aislada, Caddy local y secretos
  exclusivamente sintéticos. Las cinco migraciones se aplicaron desde cero.
- Conteos `(org,user,orgMembership,teamMembership,team,task,worklog,migrations,plan,subscription,owner)`:
  `1,2,2,1,1,1,2,5,4,1,1`.
- Smokes: health/readiness 200, request ID y `nosniff`; `/register` y Personal
  404; sesión opaca 200 y `/admin` 200. Logs sin fallos fatales.
- Incidentes del harness: dos intentos previos abortaron por tratamiento de
  cleanup/escaping de PowerShell y una comprobación de cookie con la propiedad
  JSON incorrecta. No fueron fallos de la candidata; cada DB efímera fue
  destruida y la corrida final comenzó desde cero.
- VPS, registry remoto y producción: no accedidos. Imagen local conservada.

## P4 — Billing contractual y mock — 2026-07-12

- Commits operativos: `5a3573b` (control plane), `3cdec2d` (vista) y `3599fc0`
  (404 explícito para acceso no autorizado).
- Migración: `20260712090000_billing_control_plane`, transaccional y aditiva.
- Estado neutral: customer/subscription IDs por proveedor, período, trial y
  cancelación al fin de período; no se almacenan tarjetas, precios ni secretos.
- Webhooks: firma verificada antes de parsear, evento único por
  `(provider, externalEventId)`, SHA-256 anti-reutilización y error sanitizado.
- Mock: checkout/portal devuelven referencia auditable y `url: null`; nunca
  aparentan un cobro real.
- Autorización: sólo la membresía owner activa puede consultar billing o crear
  checkout. MEMBER falla con la convención 404.
- Green gate: exit 0; 57 unitarios, 31 PostgreSQL, 3 upgrade, seis migraciones,
  drift cero, typecheck, lint, build Web (36 rutas), Electron security,
  production safety y `git diff --check`.
- Candidata correcta:
  `pulso-p4-staging:3599fc03aa21d7eac1a804d81170dd88b7ede7e0`.
- Image ID:
  `sha256:ebd17a2f6346f93130011b159ffcf57cea254a133edf07a184b73cff04b053fe`.
- Label OCI revision: coincide con el SHA; sin push, `latest`, VPS ni producción.
- Staging: PostgreSQL 16 `tmpfs`, seis migraciones y conteos
  `(org,user,membership,migrations,plans,subscription,owner,billingEvents)` =
  `1,2,2,6,4,1,1,0`.
- Smokes: health/readiness 200; registro/Personal 404; owner `/billing` 200 y
  MEMBER `/billing` 404; logs sin fallos fatales.
- Artefacto descartado: la primera imagen `3cdec2d` se eliminó al detectar antes
  de staging que el acceso directo MEMBER podía presentar 500. No fue promovida.
- Cleanup: staging y worktree eliminados; se conserva sólo la candidata correcta.

## P4 follow-up — Precios de lanzamiento y Mercado Pago mock — 2026-07-12

- Commit operativo: `3054ddb`.
- Ofertas backend: Teams 5 (USD 49 lista), Teams 10 (USD 89) y Business 50
  (USD 399), mapeadas a plan/seat limit sin acoplar IDs visuales al dominio.
- Promoción: 25% durante los primeros 12 meses; montos calculados en enteros,
  nunca floats monetarios persistidos.
- ARS: exige versión, tasa y vencimiento. Una tabla ausente/vencida bloquea el
  checkout mock; no se publicó una cotización inventada.
- Provider: `MERCADO_PAGO_MOCK`, sin red, cobros ni URL de pago ficticia.
- OAuth Mercado Pago: deliberadamente no implementado; Pulso cobra en cuenta
  propia y no actúa como marketplace/vendedor tercero.
- Prototipo visual inspeccionado en `F:\pulso-página web`: precios de lista
  tachados, 25% OFF, duración y placeholder ARS; lint/build Next 16 verdes y
  revisión visual local realizada.
- Green gate control plane: 59 unitarios, 31 PostgreSQL, 3 upgrade, seis
  migraciones, drift cero, typecheck, lint, build, Electron y safety verdes.
# Evidencia P5 Gmail OAuth y outbox end-to-end — 2026-07-12

- Consentimiento personal Google OAuth con scope único `gmail.send`.
- Refresh token guardado únicamente cifrado en `.env`; valor no expuesto.
- Smoke directo `verifyConnection` + `users.messages.send`: OK, destinatario propio.
- Smoke aislado: PostgreSQL 16 efímero, siete migraciones desde cero, identidad
  sintética, auth → outbox cifrado → worker Gmail → `SENT`: OK.
- Guardas verificadas: ACK literal, `DATABASE_URL === TEST_DATABASE_URL`, host
  loopback y nombre exacto `pulso_email_smoke`.
- Contenedor, base y volumen destruidos al finalizar. Sin VPS ni producción.
- Green gate completo posterior: 66 unitarios, 34 DB-backed, 3 upgrade,
  siete migraciones, drift cero, build, Electron y safety checks verdes.
- Candidata construida desde worktree detached limpio:
  `b0f274045042d55d8f164d49064a7b88fa632a61`.
- Tag SHA completo subido, sin `latest`:
  `docker.io/valenziegenbein/pulso-app:b0f274045042d55d8f164d49064a7b88fa632a61`.
- Digest remoto obtenido por push, descargado nuevamente e inspeccionado:
  `docker.io/valenziegenbein/pulso-app@sha256:87e22dd3eb21bb529d8774b409af4d0ca3bd2eb944fbfed68c21f6c5d779238a`.
- Label OCI remota `org.opencontainers.image.revision` coincide con el SHA.
- Staging efímero por digest: `migrate deploy` de siete migraciones, health 200,
  readiness + headers, `/register` 404 y `/api/personal/suggest` 404.
- Staging, PostgreSQL tmpfs, red y contenedores destruidos al finalizar.
- Backup productivo `pulso-20260712T203025Z`: dump PostgreSQL 16, age, SHA-256,
  transferencia cifrada a `F:` y verificación completa.
- Restore del backup real + upgrade 2→7 migraciones: conteos preservados
  `2,6,6,4,6,1`; readiness y superficies cerradas verdes.
- Producción promovida por Image ID equivalente al digest remoto; app y worker
  usan `sha256:87e22dd3...`, cero reinicios.
- Post-deploy: health/readiness 200, `/register` 404,
  `/api/personal/suggest` 404, cinco batches Gmail `failed=0`.
- Refresh token recifrado dentro del VPS con la clave productiva; plaintext sólo
  transitó por stdin y no fue almacenado ni mostrado.
- Rollback: `/var/backups/pulso/deploy-20260712T204705Z-p5` y tag
  `pulso-rollback:p5-20260712T204705Z`.

## P6 local — Mercado Pago sandbox fail-closed — 2026-07-12

- Migración aditiva `20260712230000_billing_checkout_attempts`: cotización ARS,
  oferta, plan, seats, actor, proveedor, expiración y referencias externas con
  checks monetarios y claves únicas.
- Cada checkout invalida intentos pendientes anteriores bajo advisory lock por
  organización. Sólo owner activo puede crearlo.
- Adapter real con token TEST/APP_USR coherente al modo, timeout, idempotency
  key, URL de retorno validada y destino de checkout limitado a dominios de
  Mercado Pago.
- Webhook: HMAC oficial (`x-signature`, `x-request-id`, `data.id`), body máximo
  64 KiB, consulta autoritativa de preapproval, monto/moneda/referencia
  cotejados con PostgreSQL e inbox idempotente.
- Credencial TEST local verificada read-only. No se creó preapproval externa por
  faltar comprador sandbox separado; el smoke reversible quedó preparado.
- PostgreSQL gate: 8 migraciones desde cero, status actualizado, drift cero,
  35 pruebas DB-backed, 3 pruebas de upgrade y conteos sintéticos preservados.
- README ajenos continúan intactos fuera del índice. Sin VPS, deploy ni cobros.
- Candidata construida desde worktree detached limpio:
  `352e8d8fe620356c30f69087cefbd74187ee356c`.
- Tag SHA completo, sin `latest`:
  `docker.io/valenziegenbein/pulso-app:352e8d8fe620356c30f69087cefbd74187ee356c`.
- Digest remoto verificado mediante push, eliminación del tag local, pull e
  inspección de label OCI:
  `docker.io/valenziegenbein/pulso-app@sha256:06ec80c59940691564dbaea2550f85ae3dfc29783f2c5c0494d31cd3eec2f7a1`.
- Staging efímero local por digest: PostgreSQL 16 tmpfs, ocho migraciones,
  health/readiness 200, registro/Personal 404, webhook mock 404 y revisión de
  arranque coincidente. Contenedores, red y DB destruidos al finalizar.
- Incidente del harness: la primera corrida abortó porque PowerShell elevó el
  primer `curl` sin respuesta durante el arranque; el `finally` limpió todo y la
  repetición desde cero quedó verde. No fue un fallo de la candidata.

## Control de acceso anticipado Personal — 2026-07-14

- Commits funcionales: `e042e706e83e38705afae16fd667701677df21c9`,
  `ab09f59e74e27d97e06146c43c3039d7752f36b1` y fix operativo
  `8178f1a93fcf881496dc88a88212022f2ffd0179`.
- Green gate final: 94 unitarios, 38 PostgreSQL DB-backed y 3 de upgrade;
  typecheck, lint, build de 41 rutas, Electron security, production safety y
  `git diff --check` verdes. Nueve migraciones desde cero, status al día y sin
  drift.
- Imagen final publicada y re-descargada por digest:
  `docker.io/valenziegenbein/pulso-app@sha256:3f760a61c77ddabe116d657080cf8850cacc7bdb19f6e7150b82d7bf3fdc3a07`.
  Label OCI `org.opencontainers.image.revision` verificado contra `8178f1a...`.
- Backup previo `pulso-20260713T232738Z`: cifrado, checksums verificados y
  restore aislado PostgreSQL 16 desde
  `F:\Pulso-backups\verified\pulso-20260713T232738Z`.
- Migración aditiva `20260713223000_personal_early_access` aplicada con
  `prisma migrate deploy`; segunda verificación sin pendientes.
- `valenziegenbein@gmail.com`: identidad superadmin activa/verificada con
  workspace operativo y reset de contraseña de un solo uso enviado. No se
  generó ni expuso una contraseña temporal.
- `snopsds@gmail.com`: solicitud histórica importada como `PENDING`, sin grant
  de Personal AI. El acuse automático quedó `SENT`; la aprobación permanece
  deliberadamente reservada al panel interno.
- Gemini administrado activado sin imprimir la clave. Smoke de una generación:
  modelo `gemini-3.1-flash-lite`, respuesta no vacía, 660 ms.
- Producción: app healthy y worker running, cero reinicios; health/readiness y
  login 200; registro y `/api/personal/*` 404 por defensa en profundidad;
  `/api/desktop/personal-ai` devuelve 401 sin sesión; panel interno redirige a
  login.
- Checkpoint remoto:
  `/var/backups/pulso/deploy-20260714T000534Z-early-access`.

## Assets web standalone — 2026-07-14

- Incidente: el HTML de login, tareas y panel interno cargaba, pero las hojas
  `/_next/static/css/*` respondían 404. El build conservaba 82 assets en
  `apps/web/.next/static` y no los copiaba al directorio servido por standalone.
- Fix: commit `9ebc4ca71b46a7e03a3f5b089567ee3f7c51bfd1`; copia verificable de
  `.next/static`, smoke HTTP de una hoja real y guardrail de production safety.
- Imagen publicada y re-descargada:
  `docker.io/valenziegenbein/pulso-app@sha256:23230fcfcbf773e65321bc8ad68a2d3b99771119b161e06c692b7be0a42f6ff6`.
- Smoke productivo: ambos CSS del login 200 `text/css`; health/readiness 200;
  navegador con fondo `rgb(14, 15, 18)`, tipografía del sistema y controles con
  estilos aplicados. App healthy y worker running.
- No hubo migraciones ni cambios de datos.

## Recuperación Desktop y conocimiento local-first — 2026-07-14

- Se recuperaron los cambios posteriores de Personal: selector de proyecto
  funcional, importación Markdown/Obsidian, widget estilizado, paginación y
  aviso de bitácora lista. La instalación que mostraba la regresión era 0.1.26
  y antecedía el empaquetado corregido de assets.
- Desktop 0.1.28 fue construido e instalado localmente sin firma ni publicación.
  Antes se preservaron 200 archivos / 19.983.773 bytes en
  `F:\Pulso-backups\desktop-userdata-20260714-002724\Pulso`. Smoke instalado:
  Personal/widget 200 y ambos CSS 200; health/readiness local 200.
- Gemini `batchEmbedContents` se verificó contra el proveedor real con una
  respuesta de 768 dimensiones, sin copiar ni imprimir la API key. La IA
  administrada ahora separa chat de embeddings y usa
  `RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY`.
- La sincronización documental conserva la carpeta Markdown como fuente de
  verdad, exige selección nativa y consentimiento, cifra los chunks con
  AES-256-GCM y deriva tenant/usuario de la sesión. Personal se aísla por owner
  y proyecto; Teams por organización y equipo.
- Green gate final: 100 unitarios, 40 PostgreSQL DB-backed y 3 de upgrade;
  typecheck, lint, build de 44 rutas, Electron security, production safety y
  `git diff --check` verdes. Diez migraciones desde cero, status al día y drift
  cero.
- Imagen construida desde worktree detached limpio y publicada sin `latest`:
  `docker.io/valenziegenbein/pulso-app@sha256:6452aef06ec2edcbaffc16b0c6eb514102ce78b804c5b1354f522b9d854325ae`.
  El label OCI coincide con `b7056c14e358900413bcdb129b2c89382dcf2c7d` y
  fue reverificado después de eliminar el tag local y descargar por digest.
- Staging efímero por digest: PostgreSQL 16 tmpfs, 10 migraciones, health,
  readiness y CSS 200; registro y Personal público 404. El primer intento del
  harness abortó antes de migrar por una interpolación PowerShell de la URL; el
  entorno se eliminó y la repetición desde cero quedó verde.
- Backup productivo `pulso-20260714T040008Z`: age + SHA-256 verificado en VPS y
  en `F:\Pulso-backups\verified`. Restore por streaming a PostgreSQL 16 tmpfs,
  sin dump plano: 3 organizaciones, 7 usuarios y 7 membresías preservados;
  migraciones 9→10 y dos tablas de conocimiento creadas.
- Producción promueve app/worker por el ID inmutable equivalente al digest.
  Checkpoint root-only:
  `/var/backups/pulso/deploy-20260714T041038Z-knowledge`; rollback inmediato
  `pulso-rollback:knowledge-20260714T041038Z`.
- Observación posterior: app healthy, worker running, cero reinicios, segunda
  migración sin pendientes, health/readiness/login/CSS 200, registro y
  `/api/personal/*` 404, knowledge sin sesión 401 y cero errores recientes.

## Demo real de Pulso Teams y pulso con IA — 2026-07-14

- Commits `25ee81b` y `0c3363e`: la portada administrativa usa el componente
  asíncrono de pulso con IA y existe un seed demo idempotente, bloqueado por
  opt-in, con identidades `.invalid` y sin destinatarios de correo reales.
- Dataset verificado dos veces contra PostgreSQL 16 efímero: 1 organización,
  5 usuarios, 4 equipos, 12 tareas, 6 avances publicados, 2 bloqueos y 2
  decisiones, sin duplicados.
- Green gate: 100 unitarios, suite PostgreSQL real, 10 migraciones desde cero,
  status y drift verdes, upgrade sintético, lint, build, Electron security,
  production safety y `git diff --check`.
- Imagen construida desde worktree detached limpio, publicada, descargada e
  inspeccionada por digest:
  `docker.io/valenziegenbein/pulso-app@sha256:c9413903c2788e2be32390785e1c28784fc557739e5732fec734122c32d5ea61`.
  La label OCI coincide con `0c3363ea70b1fd40068559b0233df965e36030e8`.
- Backup previo `pulso-20260714T214122Z` cifrado con age, checksum verificado y
  copia externa en `F:\Pulso-backups\verified\pulso-20260714T214122Z`.
  Checkpoint remoto:
  `/var/backups/pulso/deploy-20260714T214441Z-teams-demo`.
- Migración previa sin pendientes; app y worker promovidos por image ID.
  Readiness y smoke público verdes, incluyendo CSS y bloqueos de registro y
  Personal. Allowlist LLM limitada a `generativelanguage.googleapis.com`.
- El navegador autenticado mostró el resumen de Gemini con fuente
  `traducido por IA`, métricas, decisiones, bloqueos y carga a cuidar. La
  credencial demo se rotó al finalizar y permanece fuera de Git con ACL
  restringida.
- Captura de marketing:
  `F:\pulso-página web\public\demos\pulso-teams-admin-real.png`.

## Bandeja de acceso anticipado Teams — 2026-07-15

- Causa corregida: marketing aceptaba `teams` y `business`, pero sólo
  `personal-ai` se persistía en `EarlyAccessRequest`; por eso la consulta Teams
  existía cifrada en la outbox de contacto y no aparecía en el panel interno.
- Commits atómicos: `77536a8` agrega el producto `TEAMS`, UI, respuestas y la
  migración aditiva; `3ca2772` agrega el backfill idempotente y su runbook.
  Aprobar Teams acepta el piloto y responde, pero no crea usuarios,
  organizaciones, membresías, workspaces Personal ni grants de IA.
- Green gate completo: 102 tests unitarios, 41 PostgreSQL DB-backed y 3 de
  upgrade; 11 migraciones desde cero, status y drift verdes; typecheck, lint,
  build de 44 rutas, Electron security, production safety y `git diff --check`.
- Imagen construida desde el worktree detached limpio de
  `3ca2772f90b95ab0095cb63ccf42e7211e7d1e98`, publicada y revalidada:
  `docker.io/valenziegenbein/pulso-app@sha256:cef4f56d39acabefca3187276863787a79340a0cd44f599cb5c44954222add83`.
  El archive portable tuvo SHA-256
  `a08101026d9a68e73dfbadaec28d7dd2d94f1981d56918f3072a9389f5c3d9ba`.
- Staging efímero por digest: 11 migraciones, health/readiness/login/CSS 200,
  POST Teams 202 y una solicitud `TEAMS/PENDING`; entorno destruido al cerrar.
- Backup previo cifrado y verificado: `pulso-20260715T173624Z`, copiado a
  `F:\Pulso-backups\verified`. Restore PostgreSQL 16 tmpfs confirmado con 10
  migraciones, 4 organizaciones, 12 usuarios y 12 membresías.
- Checkpoint root-only:
  `/var/backups/pulso/deploy-20260715T174637Z-teams-inbox`. Rollback inmediato:
  `pulso-rollback:teams-inbox-20260715T174637Z`, restaurando también
  `docker-compose.before.yml` y `DEPLOYED_COMMIT.before`.
- La migración `20260715150000_teams_early_access` se aplicó una vez y una
  segunda ejecución confirmó que no había pendientes. App y worker quedaron en
  el nuevo image ID, healthy/running, cero reinicios y sin líneas error/fatal.
- El backfill productivo importó una solicitud histórica y la segunda ejecución
  importó cero/omitió una. Evidencia sin PII: 1 superadmin activo, 1 Teams
  pendiente, 1 evento `REQUESTED` y 1 acuse `SENT`.
- Smoke posterior: health/readiness/login/CSS 200; registro y Personal público
  404; panel sin sesión 307. La sesión visible de navegador era `ORG_ADMIN` y
  recibió el 404 esperado del panel global; no se alteraron roles para eludirlo.
