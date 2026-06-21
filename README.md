# Pulso

> Organizador interno de equipos, tareas, agenda y bitácora asistida por IA.
> **Hace visible el trabajo invisible sin invadir al trabajador.**

Pulso **no** es software de vigilancia: no mide mouse, teclado ni "tiempo activo",
no toma capturas automáticas y **la IA nunca publica nada sin aprobación humana**.

## Principios

- No vigilar personas. No castigar pausas. No medir actividad superficial.
- Sí registrar tareas, avances, bloqueos, decisiones y contexto.
- La IA **propone**, la persona **decide y aprueba**.
- Capturas (si existen) siempre voluntarias y manuales.
- Reducir ansiedad organizacional, no aumentarla.

## Stack

Monorepo **pnpm + Turborepo** · **Next.js** (App Router) · **SQLite + Prisma** ·
**Tailwind** · **Zod** · **Vitest** · empaquetado de escritorio con **Electron**.

```
apps/web          → UI + thin API (Next.js)
packages/domain   → dominio puro (RBAC, anti-sobrecarga, casos de uso)
packages/database → Prisma (schema, repos, seed, cifrado)
packages/llm      → strategy de proveedores LLM (local / OpenAI / Anthropic)
packages/shared   → enums, DTOs y schemas Zod compartidos
```

La lógica de negocio vive en `@pulso/domain` y **no depende** de framework ni de
Prisma. Regla de dependencias hacia adentro: `web → domain/shared/llm/database`,
`database → domain/shared`, `llm → shared`, `domain → shared`.

## Setup

Requisitos: Node ≥ 20, pnpm (vía `corepack`). **Sin Docker** — la base es SQLite.

```bash
corepack enable                 # activa pnpm
pnpm install

cp .env.example .env            # completá AUTH_SECRET y WORKLOG_ENCRYPTION_KEY
# (genera secretos con: openssl rand -hex 32)

pnpm db:generate                # cliente Prisma
pnpm db:migrate                 # crea el SQLite dev.db + lo siembra (admin@pulso.local)

pnpm dev                        # http://localhost:3000
```

El widget de bitácora funciona out-of-the-box con `LLM_PROVIDER=MOCK`
(sin API key ni red). Para IA real, ver `.env.example`.

> Nota: `.npmrc` fija `node-linker=hoisted` (requerido en Windows para empaquetar
> con Next standalone + electron-builder). El `docker-compose.yml` quedó como
> opción legacy de Postgres; ya no hace falta para correr Pulso.

### Usuario admin de prueba (seed)

- **Email:** `admin@pulso.local`
- **Password:** `pulso1234`

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm dev` | levanta la app web |
| `pnpm test` | tests de dominio y servicio de bitácora |
| `pnpm typecheck` | chequeo de tipos en todo el monorepo |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:seed` | datos demo |

## Estado

**Sprint 1 — MVP navegable** (verificado end-to-end). Implementado:

- Auth propia por sesión (cookie HMAC) + middleware de guarda + login/logout.
- Repositorios Prisma sobre los puertos de `@pulso/domain` y casos de uso
  (`assignTask` con anti-sobrecarga, `approveWorklog`).
- Server actions: crear/asignar tarea, cambiar estado, bloqueos, crear equipo,
  invitar persona, guardar/aprobar bitácora.
- Pantallas con datos reales: login, dashboard personal, panel de equipo (admin),
  tareas (lista + detalle), equipos y personas.
- Widget de bitácora que persiste el borrador (la IA propone, el humano aprueba).

Pendiente (siguientes sprints): emails/activación de invitados, SSO, edición de
permisos por UI, comentarios, notificaciones y reporting histórico.

> Nota: si el puerto 5432 está ocupado por otro Postgres local, definí
> `PULSO_DB_PORT` (lo lee docker-compose) y ajustá el puerto en `DATABASE_URL`.
