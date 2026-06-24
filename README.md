# Pulso

Pulso coordina equipos, tareas, avances, bloqueos, decisiones y bitacora asistida
por IA. Hace visible el trabajo sin convertirlo en vigilancia.

Pulso **no** mide mouse, teclado, tiempo activo ni actividad privada. No toma
capturas automaticas. La IA propone; una persona aprueba.

## Superficies

- **Pulso Web/Server**: panel de control para login/register, organizaciones,
  equipos, miembros, tareas, resumen, administracion, planes/seats y gestion de
  bitacora.
- **Pulso Desktop**: superficie diaria de trabajo para onboarding personal,
  widget flotante, capturas manuales, registrar avances, exportaciones y flujo
  cotidiano.

## Stack

Monorepo pnpm + Turborepo:

```text
apps/web           Next.js App Router, server actions, panel web
apps/desktop       Electron, widget y flujo cotidiano
packages/domain    RBAC, ownership y casos de uso puros
packages/database  Prisma, PostgreSQL, repositorios, seed y cifrado
packages/llm       Proveedores LLM y servicios de sugerencias
packages/shared    Enums, DTOs y schemas Zod
```

La regla de dependencia es hacia adentro: `web -> domain/shared/llm/database`,
`database -> domain/shared`, `llm -> shared`, `domain -> shared`.

## Desarrollo

Requisitos: Node 20+, pnpm via Corepack y una base PostgreSQL accesible por
`DATABASE_URL`.

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Seed demo:

```bash
pnpm db:seed
```

Usuario demo habitual:

- Email: `admin@pulso.local`
- Password: `pulso1234`

## Produccion

Ver [DEPLOY.md](./DEPLOY.md). En produccion el server usa Docker + PostgreSQL.
La ruta `/register` permite crear una organizacion y su primer `ORG_ADMIN`.

## IA

En Web/Server la IA se configura por organizacion desde **Admin -> IA de la
organizacion**. La API key se cifra con `WORKLOG_ENCRYPTION_KEY` y no vuelve al
cliente.

Si no hay config activa:

- el pulso del equipo usa resumen heuristico;
- las sugerencias de tareas/bitacora usan mock/fallback.

LM Studio u otro proveedor local debe exponerse con un `baseUrl` alcanzable por
el servidor, no por el navegador.

## Scripts

| Comando | Que hace |
| --- | --- |
| `pnpm dev` | levanta apps en modo desarrollo |
| `pnpm build` | build del monorepo |
| `pnpm typecheck` | chequeo de tipos |
| `pnpm test` | tests |
| `pnpm db:generate` | genera Prisma Client |
| `pnpm db:migrate` | aplica migracion dev |
| `pnpm db:seed` | datos demo |

## Principios

- Coordinar trabajo, no vigilar personas.
- Capturas solo manuales y voluntarias.
- No hay publicacion automatica de contenido generado por IA.
- Pocos botones, acciones claras, sin dashboards recargados.
