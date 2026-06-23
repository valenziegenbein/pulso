# Claude handoff - Pulso Teams MVP

Fecha: 2026-06-23
Rama: `codex/web`
Commit principal: `685eb15 feat(teams): add MVP teams mode`
Release desktop publicado: `v0.1.12`

Este documento resume lo avanzado por Codex para que Claude pueda continuar sin
adivinar. Es intencionalmente honesto: separa lo que esta implementado de lo que
es MVP, fragil o deuda.

## Resumen corto

Se implemento un MVP de Teams encima del modo personal existente, sin reescribir
la arquitectura. El modo personal sigue existiendo y el modo Teams convive en las
rutas autenticadas.

Tambien se extendio el widget Teams con notificaciones sutiles para tareas
nuevas/recientes, se conecto el widget Teams al shell de Electron y se publico el
cliente desktop `0.1.12` en GitHub Releases para que el cliente instalado pueda
actualizarse.

Antes del MVP Teams ya se habia avanzado en el modo personal: las imagenes y
capturas adjuntas al widget/bitacora ahora se mandan al servicio LLM como parte
del contexto, no solo quedan pegadas a la entrada.

## Estado de GitHub y release

- Branch subida: `origin/codex/web`.
- Commit: `685eb153e54c20e61baea1f8835c8856fabb6eeb`.
- Tag remoto: `v0.1.12`, corregido para apuntar a ese commit.
- Release: `https://github.com/valenziegenbein/pulso/releases/tag/v0.1.12`.
- Assets publicados: `latest.yml`, `Pulso-Setup-0.1.12.exe`,
  `Pulso-Setup-0.1.12.exe.blockmap`.
- Artefacto local: `apps/desktop/dist/Pulso Setup 0.1.12.exe`.

Nota honesta: `electron-builder` creo inicialmente el release/tag contra `main`.
Despues se forzo el tag remoto `v0.1.12` para apuntar al commit real de
`codex/web`. El ref remoto esta bien, aunque el campo `target_commitish` de la
API de GitHub puede seguir mostrando `main`.

## Stack detectado

- Monorepo TypeScript con `pnpm`/Turbo.
- Web: Next.js App Router.
- DB: Prisma + SQLite.
- UI: React/Tailwind con tema dark, cards sobrias y acento calido.
- Desktop: Electron + `electron-builder` + `electron-updater`.
- LLM: paquete `@pulso/llm` con providers mock, OpenAI-compatible y Anthropic.

En esta maquina `pnpm`/`corepack` no estaban en PATH, asi que las verificaciones
se corrieron con binarios locales `node_modules/.bin/*.CMD`.

## Cambios principales

### 1. Imagenes/capturas pasan a la LLM

Archivos relevantes:

- `apps/web/src/components/personal/personal-widget.tsx`
- `apps/web/src/components/pulso-widget.tsx`
- `apps/web/src/app/api/personal/suggest/route.ts`
- `apps/web/src/app/api/worklog/suggest/route.ts`
- `apps/web/src/lib/personal/ai.ts`
- `apps/web/src/lib/llm.ts`
- `packages/llm/src/provider.ts`
- `packages/llm/src/worklog-suggestion.service.ts`
- `packages/llm/src/providers/*`

Que hace:

- Las capturas siguen siendo manuales/voluntarias.
- Si hay imagen, se reduce en cliente y se manda como `images` al endpoint de
  sugerencia.
- Los providers LLM aceptan contenido multimodal cuando el provider lo soporta.
- Hay fallback/mock para no bloquear la app si no hay API key o si falla la IA.

### 2. Modelos y seed Teams

Archivos relevantes:

- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20260623123000_teams_mvp/migration.sql`
- `packages/database/prisma/seed.ts`
- `packages/shared/src/enums.ts`
- `packages/shared/src/schemas.ts`

Modelo implementado:

- `Organization`
- `Team`
- `OrgMembership`
- `TeamMembership`
- `Role`
- `Task`
- `WorklogEntry`
- `DecisionRequest`
- `Blocker`
- `Attachment`
- `AuditEvent`
- `LLMProviderConfig`

No se creo una tabla literal `TeamMember`; se reutilizo el modelo existente mas
normalizado con `User`, `OrgMembership` y `TeamMembership`.

Seed demo:

- Organizacion: `Pulso Demo`.
- Equipos: `Producto`, `Operaciones`, `Soporte`.
- Usuarios:
  - `admin@pulso.local` / `pulso1234` - Maria Salazar - `ORG_ADMIN`.
  - `luis@pulso.local` / `pulso1234` - Luis Romero - `TEAM_ADMIN`.
  - `ana@pulso.local` / `pulso1234` - Ana Perez - `MEMBER`.
  - `carla@pulso.local` / `pulso1234` - Carla Medina - `MEMBER`.
- Tareas demo, bloqueos, decision pendiente y bitacoras publicadas.

### 3. Modo Teams UI

Archivos relevantes:

- `apps/web/src/app/(app)/layout.tsx`
- `apps/web/src/app/(app)/page.tsx`
- `apps/web/src/app/(app)/tasks/page.tsx`
- `apps/web/src/app/(app)/tasks/[id]/page.tsx`
- `apps/web/src/app/(app)/teams/page.tsx`
- `apps/web/src/app/(app)/teams/[id]/page.tsx`
- `apps/web/src/app/(app)/members/page.tsx`
- `apps/web/src/app/(app)/admin/page.tsx`
- `apps/web/src/components/teams/task-suggestion-panel.tsx`

Rutas:

- `/` - Resumen Teams. Admin ve dashboard; member ve una vista propia.
- `/tasks` - Lista de tareas agrupada por estado y formulario simple.
- `/tasks/[id]` - Detalle de tarea.
- `/teams` - Equipos.
- `/teams/[id]` - Detalle de equipo.
- `/members` - Personas/carga.
- `/admin` - Admin liviano.
- `/personal` - El modo personal sigue disponible desde la navegacion.

La UI intenta cumplir "pocos botones, gran impacto": acciones primarias claras,
listas/cards simples y poco dashboard.

### 4. Servicios/actions Teams

Archivos relevantes:

- `apps/web/src/server/actions/teams.ts`
- `apps/web/src/server/actions/tasks.ts`
- `apps/web/src/server/actions/worklog.ts`
- `apps/web/src/server/actions/decisions.ts`
- `apps/web/src/server/queries.ts`
- `packages/database/src/repositories.ts`
- `packages/domain/src/teams-permissions.ts`
- `packages/domain/src/permissions.ts`
- `packages/domain/src/ports.ts`

Casos cubiertos:

- Crear equipo.
- Invitar/anadir miembro demo.
- Crear tarea manual.
- Asignar tarea con advertencia simple de sobrecarga.
- Cambiar estado.
- Registrar bitacora como borrador.
- Aprobar/publicar bitacora.
- Reportar bloqueo.
- Pedir/resolver decision.
- Queries para dashboards admin/member, equipos, miembros, tareas y widget.

Importante: las acciones no publican automaticamente contenido generado por IA.
El widget guarda borradores y la publicacion/aprobacion es accion humana.

### 5. Sugerencia de tareas con IA/mock

Archivos relevantes:

- `apps/web/src/app/api/tasks/suggest/route.ts`
- `packages/llm/src/task-suggestion.service.ts`
- `packages/llm/src/task-suggestion.service.test.ts`
- `apps/web/src/components/teams/task-suggestion-panel.tsx`

Flujo:

- Admin escribe una instruccion natural.
- API arma contexto con organizacion, equipo, miembros y tareas activas.
- `TaskSuggestionService` pide JSON estructurado al provider.
- Si falla o no hay provider real, usa `fallbackTaskSuggestion`.
- La IA nunca crea/asigna sola; el admin debe aprobar la sugerencia.

Output esperado:

- `title`
- `description`
- `expectedOutcome`
- `definitionOfDone`
- `suggestedPriority`
- `suggestedAssigneeId`
- `dueDate`
- `reasoning`

### 6. Widget Teams y notificaciones

Archivos relevantes:

- `apps/web/src/app/widget/page.tsx`
- `apps/web/src/components/pulso-widget.tsx`
- `apps/web/src/components/open-widget-button.tsx`
- `apps/web/src/server/queries.ts` (`getWidgetFocus`)
- `apps/desktop/main.js`
- `apps/desktop/preload.js`

Que se agrego:

- Selector de tarea actual.
- Avance asociado a tarea de equipo.
- Captura manual opcional.
- Link opcional.
- Chips de captura/bloqueo/decision.
- Generacion de bitacora.
- Guardado como borrador.
- Si el borrador es `BLOCKER` o `DECISION`, se crea el bloqueo/decision al
  guardar.
- Texto de privacidad: "La IA propone. Vos aprobas."
- Notificaciones sutiles:
  - `nueva` si la tarea fue creada hace menos de 72h.
  - `reciente` si fue actualizada/asignada hace menos de 48h y aun no tiene
    bitacora.
  - La pill colapsada muestra contador.

Desktop:

- Electron ahora distingue widget personal (`/captura`) y Teams (`/widget`).
- `preload.js` expone `showTeamsWidget`, `showPersonalWidget`, `setView` y
  `onWidgetView`.
- El boton Teams usa `showTeamsWidget`.

### 7. Desktop release y DB instalada

Archivos relevantes:

- `apps/desktop/main.js`
- `apps/desktop/preload.js`
- `apps/desktop/package.json`
- `apps/desktop/prepare-standalone.cjs`

Version desktop bump: `0.1.11` -> `0.1.12`.

Problema real detectado:

- La app instalada conserva `%APPDATA%/Pulso/pulso.db`.
- El schema Teams agrega tablas/columnas.
- Si el cliente instalado arrancaba con una DB vieja, Prisma podia fallar.

Solucion pragmatica implementada:

- Al iniciar desktop empaquetado, `ensureDatabase()` revisa si la DB existente
  contiene marcadores del schema Teams (`DecisionRequest`, `Blocker`,
  `expectedOutcome`).
- Si no los tiene y existe template nuevo, hace backup:
  `%APPDATA%/Pulso/pulso.backup-<timestamp>.db`
- Luego reemplaza la DB activa por la semilla nueva.

Esto evita crash, pero NO es una migracion real de datos. Es aceptable como MVP
demo, pero no para datos productivos. Hay que reemplazarlo por migraciones reales
de SQLite antes de depender de datos persistentes de equipos.

## Verificaciones ejecutadas

Comandos que pasaron:

```powershell
node --check apps\desktop\main.js
node --check apps\desktop\preload.js
node_modules\.bin\tsc.CMD -p apps\web\tsconfig.json --noEmit --incremental false
node_modules\.bin\vitest.CMD run --cache=false packages\llm\src packages\domain\src
..\..\node_modules\.bin\next.CMD build   # desde apps\web
git diff --check
```

Resultados:

- Typecheck web OK.
- Tests LLM/domain OK: 4 archivos, 13 tests.
- Next production build OK.
- Electron syntax check OK.
- `electron-builder --win nsis --publish always` OK.

Tambien se aplico localmente:

```powershell
node_modules\.bin\prisma.CMD format --schema packages\database\prisma\schema.prisma
node_modules\.bin\prisma.CMD generate --schema packages\database\prisma\schema.prisma
node_modules\.bin\prisma.CMD migrate deploy --schema packages\database\prisma\schema.prisma
node_modules\.bin\tsx.CMD packages\database\prisma\seed.ts
```

DB local verificada con datos demo: orgs, teams, users, tasks, blockers y
decisions presentes.

## Limitaciones y deuda honesta

### Auth/demo

- Hay login real con cookie local y password hash, pero sigue siendo auth demo.
- `getAuthContext()` toma la primera membresia de organizacion del usuario.
- No hay seleccion de organizacion multi-tenant real.
- No hay invitacion por email ni setup de password; `invitePersonAction` crea
  usuarios con password temporal `pulso1234`.

### Permisos

- Existen permisos atomicos y helpers (`canCreateTeam`, `canAssignTask`,
  `canViewTeam`, `canManageMember`, `canApproveWorklog`).
- No toda la logica de permisos esta aplicada de forma uniforme en actions.
- Ejemplo importante: `MEMBER` tiene `TASK_EDIT` para permitir avances/bloqueos,
  pero algunas actions validan solo permiso + organizacion, no ownership estricto.
  La UI limita bastante, pero el backend necesita endurecer ownership/team scope.

### Estados y nombres

La especificacion inicial pedia:

- `PENDING`, `REVIEW`, `CANCELED`
- Worklog `APPROVED`

La app ya tenia vocabulario propio y se respeto:

- `BACKLOG`, `TODO`, `IN_PROGRESS`, `BLOCKED`, `IN_REVIEW`, `DONE`,
  `CANCELLED`
- Worklog `DRAFT`, `PUBLISHED`, `DISCARDED`

Esto evita duplicar conceptos, pero conviene decidir si se quiere alinear naming
externo/documentacion.

### DB desktop

- La estrategia actual para DB vieja es backup + reemplazo por template.
- No migra datos existentes.
- Antes de datos reales, implementar migracion SQLite incremental o Prisma
  migrate runtime confiable para `%APPDATA%/Pulso/pulso.db`.

### LLM/config

- `LLMProviderConfig` existe en DB, pero el servicio web hoy resuelve provider
  principalmente desde env (`LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`,
  `LLM_API_KEY`).
- Falta UI/flujo productivo por organizacion para configurar provider en Teams.
- El mock/fallback esta bien para MVP y demo.

### Widget

- El widget Teams crea bloqueo/decision cuando el borrador generado tiene ese
  tipo y se guarda. Eso es util, pero no hay pantalla dedicada para editar el
  bloqueo/decision antes de crearlo.
- La pill muestra contador, no lista completa. Es intencionalmente sutil.
- No hay tracking automatico ni captura automatica.

### UI

- MVP simple, no plataforma tipo Jira.
- Algunas pantallas todavia usan formularios basicos y no modales refinados.
- Hay textos con encoding raro heredado en varios archivos (acentos mojibake).
  No se corrigio masivamente para evitar ruido.

### Docs existentes

- `apps/desktop/README.md` esta parcialmente desactualizado respecto al estado
  nuevo del shell:
  - La ventana principal carga `/personal`.
  - El widget personal usa `/captura`.
  - Teams usa `/widget`.
  - Ahora hay fallback de DB vieja con backup + reemplazo.
- Conviene actualizar ese README si se va a usar como fuente publica.

## Siguientes pasos recomendados

1. Endurecer permisos backend por ownership/team scope antes de confiar en roles.
2. Reemplazar backup+reseed desktop por migraciones SQLite reales.
3. Actualizar `apps/desktop/README.md`.
4. Pulir UI de detalle para aprobar/publicar bitacoras desde tareas/equipos.
5. Hacer QA manual instalado en Windows:
   - auto-update desde `0.1.11` a `0.1.12`;
   - login Maria/Luis/Ana;
   - widget personal vs widget Teams;
   - DB vieja con backup;
   - crear tarea con IA mock y aprobar.
6. Si Teams va a salir a usuarios reales, definir modelo de auth/invitaciones y
   migracion de datos antes de seguir agregando funciones.

## Recordatorio de filosofia del producto

Pulso Teams se implemento como coordinacion de trabajo, no vigilancia. No hay:

- tracking de mouse;
- tracking de teclado;
- medicion de tiempo activo;
- capturas automaticas;
- rankings invasivos.

Las capturas son manuales y voluntarias. La IA propone; la persona aprueba.
