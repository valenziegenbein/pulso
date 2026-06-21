# AGENTS.md — Cómo trabajar en Pulso (para agentes humanos y de IA)

> **Leé esto antes de tocar el repo.** Define cómo trabajar en paralelo sin
> pisarse ni meter regresiones. Aplica a Codex, Claude y cualquiera que edite acá.

Pulso es un organizador interno de equipos con bitácora asistida por IA. Empaqueta
una app de escritorio (Electron) con un server Next standalone + SQLite embebido.
Principio de producto: **hacer visible el trabajo sin vigilar** y **la IA propone,
el humano aprueba** (nada se publica solo).

## Estructura (monorepo pnpm + Turborepo)

```
apps/web          → Next.js (App Router): UI + thin API + server actions
apps/desktop      → Electron shell (ventanas, widget flotante, auto-update, packaging)
packages/domain   → dominio puro (RBAC, anti-sobrecarga, casos de uso). SIN framework.
packages/database → Prisma (schema SQLite, repos, seed, cifrado)
packages/llm      → strategy de proveedores LLM (local / OpenAI / Anthropic / mock)
packages/shared   → enums (uniones de strings), DTOs y schemas Zod compartidos
```

Regla de dependencias hacia adentro: `web → domain/shared/llm/database`,
`database → domain/shared`, `llm → shared`, `domain → shared`. **El dominio nunca
importa infraestructura.**

## Setup

Requisitos: Node ≥ 20, pnpm (vía `corepack`). **No usa Docker** (SQLite embebido).

```bash
corepack enable
pnpm install
pnpm db:generate
pnpm db:migrate     # crea/siembra el SQLite dev.db (admin@pulso.local / pulso1234)
pnpm dev            # http://localhost:3000
```

## ✅ Portón verde — corré esto ANTES de dar algo por terminado

Esto es lo que atrapa regresiones. **No marques una tarea como lista si algo de
esto falla.**

```bash
pnpm typecheck            # tsc en todos los paquetes
pnpm test                 # vitest (dominio + servicio de bitácora)
pnpm --filter web build   # build de producción (incluye chequeo de tipos de Next)
```

Si tocaste el schema de Prisma: `pnpm db:generate` antes del portón.

## 🚧 Trabajo en paralelo — reglas para no pisarse

1. **Nunca commitees directo a `main`.** Trabajá en una rama por tarea:
   `feat/<area>-<corto>` o `fix/<area>-<corto>` (ej: `feat/web-comentarios`).
   `main` queda siempre en verde (portón pasando).
2. **Respetá la propiedad de áreas** (ver abajo). No edites el área del otro sin avisar.
3. **Commits chicos y frecuentes**, mensajes claros. Integrá seguido para no
   divergir (rebase/merge de `main` a tu rama a menudo).
4. **Antes de mergear a `main`: corré el portón verde.** Si no pasa, no se mergea.
5. **Cambios additivos** en lo compartido siempre que se pueda (agregar, no renombrar/borrar).

### Setup local de ESTE proyecto (mismo equipo, sin remoto) — git worktrees

Carpetas separadas que comparten la misma historia git, para no pisarse archivos:

| Carpeta | Rama | Para |
|---|---|---|
| `F:\Pulso` | `main` (integración) + `claude/desktop` | Integración + área de Claude (`apps/desktop`) |
| `F:\Pulso-codex` | `codex/web` | Área de Codex (`apps/web`) |

Cada carpeta tiene su propio `node_modules`, `.env*` y `dev.db` (gitignoreados).

Flujo de cada agente:
1. Trabajá en **tu** carpeta/rama (Codex: `F:\Pulso-codex`; Claude: `F:\Pulso`).
2. Antes de integrar: **portón verde** (`pnpm typecheck && pnpm test && pnpm --filter web build`).
3. Commiteá en tu rama. Llevar a `main` (desde `F:\Pulso`):
   `git checkout main && git merge <rama> && <portón verde> && git checkout <rama>`.
4. Traé lo último seguido: `git merge main` en tu rama (evita divergencias grandes).

> Codex: trabajás en **`F:\Pulso-codex`** (rama `codex/web`), sobre `apps/web`. No edites `F:\Pulso`.

### Propiedad de áreas (editar este mapa cuando cambie)

| Área | Dueño actual | Notas |
|---|---|---|
| `apps/desktop/**` (Electron, widget, auto-update, packaging/release) | **Claude** | No tocar sin coordinar. |
| `apps/web/**` (pantallas, componentes, server actions, queries) | **Codex** | Features de producto. |
| `packages/domain/**` (reglas de negocio, casos de uso) | Codex (coordinar) | |
| `packages/llm/**` | Compartido | Cambios additivos. |

### Archivos de ALTA colisión — coordinar sí o sí antes de editar

- `packages/database/prisma/schema.prisma` — un cambio de schema rompe a todos.
  Avisá antes, hacelo additivo, corré `pnpm db:generate` + `pnpm db:migrate`, y
  actualizá `packages/shared/src/enums.ts` si agregaste un "enum".
- `packages/shared/src/enums.ts` y `schemas.ts` — contratos compartidos.
- `package.json` (raíz y de cada paquete) y `pnpm-lock.yaml` — al agregar deps,
  hacelo aislado en su propio commit para mergear fácil.
- `apps/desktop/package.json` (versión + publish) — **solo Claude** (controla releases).

## Convenciones técnicas (no romper)

- **SQLite + Prisma**: no soporta enums ni `String[]`. Los "enums" se guardan como
  `String` (validados por las uniones de `@pulso/shared`); `Role.permissions` y
  `AuditEvent.metadata` van como **JSON en texto**. Casteá en el borde infra→dominio.
- **pnpm hoisted** (`.npmrc`: `node-linker=hoisted`) — requerido para empaquetar en
  Windows. No lo cambies.
- **Secretos por entorno, nunca commiteados**: `.env*`, tokens, `*.db` están
  gitignoreados. No los subas. No hardcodees proveedores LLM ni API keys.
- **Auth**: sesión por cookie HMAC; la lógica de permisos va en los casos de uso,
  no en la UI.

## Releases / auto-update (solo Claude, coordinado)

La app de escritorio se auto-actualiza desde GitHub Releases. **No publiques una
versión sin coordinar** (evita pisar tags/versiones). Detalle en
`apps/desktop/README.md`. Resumen: subir `version` en `apps/desktop/package.json`
→ `GH_TOKEN=<token> pnpm --filter @pulso/desktop release`.

## No subir nunca

`.env` y `.env.local`, tokens/PATs, `*.db`, `apps/desktop/dist/`,
`apps/desktop/db-template/`, `node_modules/`, `.next/`. (Ya están en `.gitignore`.)
