# Estado del programa Pulso

Última actualización: 2026-07-12 (America/Buenos_Aires)

## Fase actual

**P5 — Email transaccional: COMPLETA EN LOCAL**.
Outbox cifrado, templates, integración atómica con auth, worker, provider Gmail
OAuth, redirect local, consentimiento, smoke directo y smoke auth → outbox →
worker aislado están verdes. Falta promoción; registro público continúa cerrado.

El hardening está versionado, respaldado, registrado, validado en staging y
desplegado en producción. El segundo destino offsite duradero permanece como
riesgo operativo aceptado; la copia cifrada y restaurada existe en `F:`.

## Estado por fase

| Fase | Estado | Evidencia / próximo gate |
| --- | --- | --- |
| P0.5 | Completa | G1–G7 cumplidos; producción healthy y smoke verde |
| P1 | Completa | G1–G5 cumplidos; candidata inmutable y staging sintético verdes |
| P2 | Completa local/staging | G1–G5 verdes; registro público deliberadamente cerrado |
| P3 | Completa local/staging | Seats transaccionales, ownership, planes y cuotas fail-closed |
| P4 | Completa local/staging (mock) | Provider neutral, webhook inbox y vista owner-only verdes |
| P5 | Completa local | Gmail real y outbox end-to-end verdes; falta candidata y promoción |
| P6 | No iniciada | Sin cambios visuales ni rutas públicas nuevas |
| P7 | No iniciada | Sin analytics ni observabilidad compleja añadida |

## Baseline de versionado

- Worktree: `F:\Pulso-codex`
- Rama: `codex/web-control-plane-hardening`
- Commit inicial: `e8ac1cf6d98c2163abf6bdcabbceab88b9bc9220`
- HEAD funcional previo a este documento: `8018a5f`
- Commits locales desde el baseline: 33 antes de este checkpoint documental
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
| G5 Migración de staging | Cumplido | Imagen `5bf0b9c`; migrate, fixture, readiness y smokes verdes |

## Gates P2

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G1 Modelo y migración | Cumplido localmente | Migración transaccional, backfill y preflight |
| G2 Auth local + mock email | Cumplido | Flujos completos; sink mock no conserva tokens |
| G3 Aislamiento y tokens | Cumplido | 24 DB-backed; replay/revocación/rate limit/invites |
| G4 Desktop PKCE | Cumplido | S256 + state + loopback + sesión particionada |
| G5 Staging completo | Cumplido | Imagen `32d6822`; migrate, sesión, revocación y smokes verdes |
| G6 Abrir registro | Diferido | Requiere outbox/email real y promoción específica |

## Gates P3

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G1 Planes y suscripciones | Cumplido | Catálogo persistido y suscripción organizacional mock |
| G2 Seats y ownership | Cumplido | Lock organizacional, invitaciones pendientes sin seat y último owner protegido |
| G3 Cuotas AI | Cumplido | Ledger idempotente; BYOK/local no consume cuota managed |
| G4 Suite PostgreSQL | Cumplido | 28 DB-backed, 3 upgrade, cinco migraciones y drift cero |
| G5 Staging completo | Cumplido | Imagen `ece7d4f`; migrate, fixture, sesión, admin y smokes verdes |
| G6 Billing real | Diferido | Requiere precios, moneda, impuestos, política comercial y credenciales |

## Gates P4

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G1 Contrato neutral | Cumplido | BillingProvider cubre customer, checkout, portal, cancel/resume, consulta y webhook |
| G2 Mock seguro | Cumplido | Sin cobros ni URLs ficticias; firma HMAC y payload tipado |
| G3 Persistencia/idempotencia | Cumplido | Inbox único por proveedor/evento y hash anti-reutilización |
| G4 Autorización | Cumplido | Sólo owner activo; MEMBER obtiene 404 incluso por acceso directo |
| G5 Suite PostgreSQL | Cumplido | 31 DB-backed, 3 upgrade, seis migraciones y drift cero |
| G6 Staging completo | Cumplido | Imagen `3599fc0`; migrate, sesiones owner/member y smokes verdes |
| G7 Mercado Pago real | Bloqueado | Requiere decisión comercial y credenciales específicas |

## Gates pendientes

- P0.5: ninguno.
- P5: candidata inmutable, staging y promoción.
- Programa: segundo destino offsite duradero.

## Riesgos prioritarios P0/P1/P2

- P0: el backup cifrado restaurable existe en `F:`, pero todavía no reemplaza un offsite duradero.
- P0: hardening desplegado por digest; producción healthy y smoke verde.
- P0: historial productivo de migraciones contrastado sin diferencias.
- P1: constraints tenant-críticas implementadas localmente; relaciones opcionales
  con `SET NULL` permanecen bajo authz y se revisarán sin introducir RLS automático.
- P1: backup/restore con age fue probado end-to-end contra PostgreSQL 16 aislado.
- P2: auth persistida/revocable está verde en staging; no está desplegada y el
  proveedor mock bloquea deliberadamente la apertura del registro.
- P3: entitlements están verdes en staging; no están desplegados y las cuotas
  comerciales permanecen en cero hasta definir precios y unidades.

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
10. `5bf0b9c` — `test(db): add current-schema staging fixture`
11. `919d556` — `feat(auth): add persisted multi-org authentication`
12. `32d6822` — `test(auth): add synthetic staging login fixture`
13. `ece7d4f` — `feat(entitlements): enforce seats ownership and AI quotas`
14. `5a3573b` — `feat(billing): add provider-neutral subscription control plane`
15. `3cdec2d` — `feat(web): add owner-only billing overview`
16. `3599fc0` — `fix(web): return not found for unauthorized billing access`
17. `3054ddb` — `feat(billing): add versioned ARS launch pricing mock`
18. `7f8bdd1` — `feat(email): add encrypted transactional outbox`
19. `8018a5f` — `feat(email): connect auth to transactional outbox`

## Próxima acción autorizable

Construir candidata inmutable P5 y validarla en staging antes de una promoción
con backup/checkpoint. Mantener registro cerrado hasta verificación productiva.
