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

- Backup externo, checksum remoto y restore descargado.
- Historial productivo `_prisma_migrations`.
- Digest de imagen Pulso en registry.
- Staging, smokes remotos y producción.
- Ventana de observación post-deploy.
