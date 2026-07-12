# Estado del programa Pulso

Última actualización: 2026-07-12 (America/Buenos_Aires)

## Fase actual

**P1 — Migraciones y PostgreSQL: EN CURSO**. Los gates locales G1–G4 están
cumplidos; falta validar la candidata en staging para cerrar la fase.

El hardening está versionado, respaldado, registrado, validado en staging y
desplegado en producción. El segundo destino offsite duradero permanece como
riesgo operativo aceptado; la copia cifrada y restaurada existe en `F:`.

## Estado por fase

| Fase | Estado | Evidencia / próximo gate |
| --- | --- | --- |
| P0.5 | Completa | G1–G7 cumplidos; producción healthy y smoke verde |
| P1 | En curso | G1–G4 cumplidos localmente; G5 staging pendiente |
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
- HEAD operativo previo a este documento: `06058d4b88d546bc568f0e960a31a34004ff9fb1`
- Commits locales generados: 17 (10 operativos y 7 checkpoints/follow-ups)
- Tags generados: ninguno
- Pushes: ninguno
- Índice Git: vacío
- `F:\Pulso`: `main` en `be54fd85a7f666360dfc9d234f50df37790a5ad3`, limpio

## Autorización vigente

- L0 (lectura/planes): autorizado
- L1 (cambios locales reversibles): autorización continua
- L2 (commits): autorización continua para commits atómicos; sin tags, pushes ni reescrituras innecesarias
- L3 (secretos, uploads, registry): permitido sólo sin nuevos secretos/costos; detenerse si requiere credenciales
- L4 (staging): autorizado para entornos reversibles con datos sintéticos
- L5 (producción/VPS): requiere checkpoint ante migraciones, credenciales o acciones productivas sensibles

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

## Gates P1

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G1 Migraciones desde cero | Cumplido | 3 migraciones aplicadas; status actualizado |
| G2 Upgrade sintético | Cumplido | Conteos y relaciones preservados |
| G3 Suite PostgreSQL | Cumplido | 12 DB-backed + 3 upgrade; drift cero |
| G4 Runbook probado localmente | Cumplido | Preflight inválido rechazado sin DDL parcial |
| G5 Migración de staging | Pendiente | Requiere candidata inmutable posterior al commit |

## Gates pendientes

- P0.5: ninguno.
- P1: build inmutable, staging sintético y cierre de G5.
- Programa: segundo destino offsite duradero.

## Riesgos prioritarios P0/P1/P2

- P0: el backup cifrado restaurable existe en `F:`, pero todavía no reemplaza un offsite duradero.
- P0: hardening desplegado por digest; producción healthy y smoke verde.
- P0: historial productivo de migraciones contrastado sin diferencias.
- P1: constraints tenant-críticas implementadas localmente; relaciones opcionales
  con `SET NULL` permanecen bajo authz y se revisarán sin introducir RLS automático.
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
9. `06058d4` — `feat(db): enforce tenant relational integrity`

## Próxima acción autorizable

Crear commits atómicos P1, construir una imagen inmutable desde worktree limpio
y validar la migración con datos sintéticos en staging. No aplicar la migración
a producción ni abrir auth/billing durante este gate.
