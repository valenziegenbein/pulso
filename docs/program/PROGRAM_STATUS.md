# Estado del programa Pulso

Última actualización: 2026-07-11 (America/Buenos_Aires)

## Fase actual

**P0.5 — Estabilización y hardening**, detenida en **P0.5-G7:
autorización explícita de producción**.

La implementación, el versionado, el registry y el staging efímero están
listos, pero P0.5 no está terminada: falta un offsite duradero y producción.

## Estado por fase

| Fase | Estado | Evidencia / próximo gate |
| --- | --- | --- |
| P0.5 | En progreso | G1–G6 cumplidos; G7 requiere autorización explícita L5 |
| P1 | Preparación local implementada, no promovida | G1–G3 locales cumplidos; runbooks listos; staging no autorizado |
| P2 | No iniciada | Requiere cierre/checkpoint de fase anterior y diseño de migración aprobado |
| P3 | No iniciada | Depende de P2 |
| P4 | No iniciada | Depende de entitlements P3 |
| P5 | No iniciada | Gmail real bloqueado; outbox se diseña después de P4 o cuando se autorice la fase |
| P6 | No iniciada | Sin cambios visuales ni rutas públicas nuevas |
| P7 | No iniciada | Sin analytics ni observabilidad compleja añadida |

## Baseline de versionado

- Worktree: `F:\Pulso-codex`
- Rama: `codex/web-control-plane-hardening`
- Commit inicial: `e8ac1cf6d98c2163abf6bdcabbceab88b9bc9220`
- HEAD operativo previo a este documento: `a6e2a0ab55cd0a71ca669aaaa8625c2508cf55ec`
- Commits locales generados: 14 (9 operativos y 5 checkpoints/follow-ups)
- Tags generados: ninguno
- Pushes: ninguno
- Índice Git: vacío
- `F:\Pulso`: `main` en `be54fd85a7f666360dfc9d234f50df37790a5ad3`, limpio

## Autorización vigente

- L0 (lectura/planes): autorizado
- L1 (cambios locales reversibles): autorizado
- L2 (commits): autorización puntual consumida por el fix y checkpoint G6; no autoriza nuevos commits, tags, pushes ni reescrituras
- L3 (secretos, uploads, registry): autorización puntual consumida por la imagen corregida; no autoriza nuevos uploads
- L4 (staging): autorización puntual consumida; staging efímero verde
- L5 (producción/VPS): autorizaciones puntuales de P0.5-G3/G4 consumidas; no autoriza nuevas acciones

## Gates P0.5

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G1 Green gate local completo | Cumplido | `pnpm green` exit 0; ver `EVIDENCE.md` |
| G2 Autorización para commits | Cumplido | 8 commits operativos atómicos + checkpoint documental + follow-up de backup |
| G3 Backup externo subido/descargado/restaurado | Cumplido temporalmente | Bundle cifrado transferido a `F:`, checksum y restore PostgreSQL 16 aislado OK |
| G4 `_prisma_migrations` productivo comparado | Cumplido | 2 migraciones; nombres, checksums y estados coinciden exactamente |
| G5 Imagen inmutable construida y registrada | Cumplido | Imagen corregida `14bf70a` y digest remoto verificado por pull |
| G6 Staging verde | Cumplido | Migrate, fixture sintético, health/readiness, Caddy y smoke verdes |
| G7 Producción autorizada | Pendiente | Requiere L5 |

## Gates locales superados

- Typecheck global
- 55 tests unitarios/servicio
- 9 tests PostgreSQL DB-backed
- 3 tests de upgrade sintético
- Migraciones actuales desde base vacía
- `prisma migrate status`
- Drift migraciones ↔ schema: sin diferencias
- Lint
- Build Web
- Build Docker local de validación
- Electron security check
- Production safety check
- Compose y Caddy válidos
- Sintaxis/fail-closed de scripts
- `git diff --check`
- Build inmutable local desde worktree limpio en `a6e2a0a`; imagen eliminada tras validar

## Gates pendientes

- Segundo destino offsite duradero
- Producción y ventana de observación

## Riesgos prioritarios P0/P1/P2

- P0: el backup cifrado restaurable existe en `F:`, pero todavía no reemplaza un offsite duradero.
- P0: hardening está versionado y registrado por digest, pero no fue desplegado.
- P0: historial productivo de migraciones contrastado sin diferencias.
- P1: faltan constraints compuestas multi-tenant evaluadas y aprobadas; no se agregó RLS.
- P1: backup/restore con age fue probado end-to-end contra PostgreSQL 16 aislado.
- P2: auth actual no es todavía el modelo persistido/revocable definido para auth comercial.

Detalle y responsables en `RISK_REGISTER.md`.

## Commits operativos generados

1. `f703a86` — `test(llm): validate unsupported Anthropic embeddings capability`
2. `4218594` — `security(web): enforce active organization and tenant authorization`
3. `ea8a5f7` — `security(web): close public surfaces and prevent LLM SSRF`
4. `abdb5eb` — `chore(web): add HTTP and container hardening`
5. `cf88bf0` — `security(desktop): isolate remote Teams renderers`
6. `59ee460` — `test(db): validate PostgreSQL isolation and migration upgrades`
7. `99f07b3` — `ops(db): enforce safe migration backup and restore workflows`
8. `a6e2a0a` — `ops(deploy): add immutable promotion smoke and rollback workflow`

## Próxima acción autorizable

Completar **P0.5-G7** sólo con autorización explícita L5. La candidata es:

`docker.io/valenziegenbein/pulso-app@sha256:ccb32ed56d8f9d381675196de7c9a342b67f9d3e4d58ef82fdc177b6d2bc6ab6`

Antes de promover se debe conservar una referencia o artefacto verificable de
la imagen productiva actual para rollback, reverificar el backup cifrado,
ejecutar el migration job (esperado no-op), readiness/smokes y una ventana de
observación. No hay autorización productiva vigente.
