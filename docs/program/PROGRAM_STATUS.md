# Estado del programa Pulso

Última actualización: 2026-07-11 (America/Buenos_Aires)

## Fase actual

**P0.5 — Estabilización y hardening**, detenida en **P0.5-G3: backup
externo subido, descargado y restaurado**.

La implementación, el versionado y el gate local están listos, pero P0.5 no
está terminada: faltan backup externo restaurable, contraste productivo, imagen
registrada, staging y producción.

## Estado por fase

| Fase | Estado | Evidencia / próximo gate |
| --- | --- | --- |
| P0.5 | En progreso | G1 y G2 cumplidos; G3 requiere configuración y L3 |
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
- Commits operativos generados: 8 (enumerados abajo)
- Tags generados: ninguno
- Pushes: ninguno
- Índice Git: vacío
- `F:\Pulso`: `main` en `be54fd85a7f666360dfc9d234f50df37790a5ad3`, limpio

## Autorización vigente

- L0 (lectura/planes): autorizado
- L1 (cambios locales reversibles): autorizado
- L2 (commits): autorización puntual ejecutada; no autoriza más commits, tags ni reescrituras
- L3 (secretos, uploads, registry): **no autorizado**
- L4 (staging): **no autorizado**
- L5 (producción/VPS): **no autorizado**

## Gates P0.5

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G1 Green gate local completo | Cumplido | `pnpm green` exit 0; ver `EVIDENCE.md` |
| G2 Autorización para commits | Cumplido | 8 commits operativos atómicos + checkpoint documental |
| G3 Backup externo subido/descargado/restaurado | Pendiente | Requiere destino, credenciales, clave age, retención y L3 |
| G4 `_prisma_migrations` productivo comparado | Pendiente | Requiere acceso específico L5 |
| G5 Imagen inmutable construida y registrada | Pendiente | Build local validado; requiere commits L2 y registry L3 |
| G6 Staging verde | Pendiente | Requiere L4 |
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

- Push/registry (no autorizado)
- Backup externo y restore real con age
- Comparación productiva de migraciones
- Imagen Pulso por Git SHA y digest de registry
- Staging y smokes remotos
- Producción y ventana de observación

## Riesgos prioritarios P0/P1/P2

- P0: backup y restore siguen en el mismo dominio de fallo hasta completar G3.
- P0: hardening está versionado localmente, pero no fue publicado ni desplegado.
- P0: historial productivo de migraciones no fue contrastado.
- P1: faltan constraints compuestas multi-tenant evaluadas y aprobadas; no se agregó RLS.
- P1: backup/restore con age tiene sintaxis validada, pero no un ensayo end-to-end autorizado.
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

Completar **P0.5-G3**. Requiere que el titular defina:

- proveedor o destino externo;
- credenciales;
- clave pública age;
- retención definitiva;
- autorización L3 limitada a upload, descarga y restore de verificación.

No se hará push, registry, staging ni acceso al VPS bajo esa autorización salvo
que se concedan por separado.
