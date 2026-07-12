# Estado del programa Pulso

Última actualización: 2026-07-12 (America/Buenos_Aires)

## Fase actual

**P0.5 — Estabilización y hardening: COMPLETA**. El programa queda detenido
antes de iniciar formalmente P1.

El hardening está versionado, respaldado, registrado, validado en staging y
desplegado en producción. El segundo destino offsite duradero permanece como
riesgo operativo aceptado; la copia cifrada y restaurada existe en `F:`.

## Estado por fase

| Fase | Estado | Evidencia / próximo gate |
| --- | --- | --- |
| P0.5 | Completa | G1–G7 cumplidos; producción healthy y smoke verde |
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
- Commits locales generados: 15 (9 operativos y 6 checkpoints/follow-ups)
- Tags generados: ninguno
- Pushes: ninguno
- Índice Git: vacío
- `F:\Pulso`: `main` en `be54fd85a7f666360dfc9d234f50df37790a5ad3`, limpio

## Autorización vigente

- L0 (lectura/planes): autorizado
- L1 (cambios locales reversibles): autorizado
- L2 (commits): autorización puntual consumida por el checkpoint documental de cierre P0.5; no autoriza nuevos commits, tags, pushes ni reescrituras
- L3 (secretos, uploads, registry): autorización puntual consumida por la imagen corregida; no autoriza nuevos uploads
- L4 (staging): autorización puntual consumida; staging efímero verde
- L5 (producción/VPS): autorización puntual G7 consumida; no autoriza nuevas acciones productivas

## Gates P0.5

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G1 Green gate local completo | Cumplido | `pnpm green` exit 0; ver `EVIDENCE.md` |
| G2 Autorización para commits | Cumplido | 8 commits operativos atómicos + checkpoint documental + follow-up de backup |
| G3 Backup externo subido/descargado/restaurado | Cumplido temporalmente | Bundle cifrado transferido a `F:`, checksum y restore PostgreSQL 16 aislado OK |
| G4 `_prisma_migrations` productivo comparado | Cumplido | 2 migraciones; nombres, checksums y estados coinciden exactamente |
| G5 Imagen inmutable construida y registrada | Cumplido | Imagen corregida `14bf70a` y digest remoto verificado por pull |
| G6 Staging verde | Cumplido | Migrate, fixture sintético, health/readiness, Caddy y smoke verdes |
| G7 Producción autorizada | Cumplido | Digest corregido desplegado; rollback, readiness, smoke y observación verdes |

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

- P0.5: ninguno.
- Programa: segundo destino offsite duradero y autorización para iniciar P1.

## Riesgos prioritarios P0/P1/P2

- P0: el backup cifrado restaurable existe en `F:`, pero todavía no reemplaza un offsite duradero.
- P0: hardening desplegado por digest; producción healthy y smoke verde.
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

Autorizar el inicio formal de **P1 — Migraciones y PostgreSQL**. Antes de crear
nuevas migraciones se debe revisar lo ya implementado, cerrar el checkpoint de
runbook y decidir por separado constraints multi-tenant aditivas. Esta acción
no autoriza auth, billing, producción ni nuevas migraciones productivas.
