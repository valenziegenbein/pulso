# Plan de cambios P0 / P0.5

Este documento define el aislamiento del worktree antes de crear commits. No
autoriza commits, uploads, acceso al VPS, despliegues ni releases Desktop.

## Cambio ajeno preservado

Estos dos estados son textualmente equivalentes y permanecen fuera del índice:

- `README.md` eliminado;
- `README pulso.md` nuevo.

No usar `git add -A`. Antes de cada commit se debe verificar `git diff --cached
--name-status` y confirmar que ninguno de esos paths esté staged.

## Commits futuros exactos

### 1. `test(llm): validate unsupported Anthropic embeddings capability`

- `packages/llm/src/providers/embeddings.test.ts`

### 2. `security(web): enforce active organization and tenant authorization`

- `apps/web/src/app/(app)/admin/page.tsx`
- `apps/web/src/app/(app)/layout.tsx`
- `apps/web/src/app/(app)/page.tsx`
- `apps/web/src/app/(app)/teams/[id]/page.tsx`
- `apps/web/src/app/api/tasks/suggest/route.ts`
- `apps/web/src/app/api/teams/pulse/route.ts`
- `apps/web/src/app/select-organization/page.tsx`
- `apps/web/src/lib/auth/context.ts`
- `apps/web/src/lib/auth/context.test.ts`
- `apps/web/src/lib/auth/session.ts`
- `apps/web/src/lib/auth/session.test.ts`
- `apps/web/src/server/actions/auth.ts`
- `apps/web/src/server/actions/tasks.ts`
- `apps/web/src/server/actions/teams.ts`
- `apps/web/src/server/actions/worklog.ts`
- `apps/web/src/server/authz.ts`
- `apps/web/src/server/authz.test.ts`
- `apps/web/src/server/queries.ts`
- `vitest.config.ts`

### 3. `security(web): close public surfaces and prevent LLM SSRF`

- `.env.example`
- `.env.docker.example`
- `apps/web/src/app/api/personal/ai/models/route.ts`
- `apps/web/src/app/api/personal/ai/verify/route.ts`
- `apps/web/src/app/api/personal/embeddings/route.ts`
- `apps/web/src/app/api/personal/suggest/route.ts`
- `apps/web/src/app/api/personal/tasks/suggest/route.ts`
- `apps/web/src/app/api/worklog/suggest/route.ts`
- `apps/web/src/app/register/page.tsx`
- `apps/web/src/lib/deployment-features.ts`
- `apps/web/src/lib/deployment-features.test.ts`
- `apps/web/src/lib/llm.ts`
- `apps/web/src/server/actions/admin.ts`
- `apps/web/src/server/llm-url-policy.ts`
- `apps/web/src/server/llm-url-policy.test.ts`
- `Caddyfile`

### 4. `chore(web): add HTTP and container hardening`

- `apps/web/next.config.mjs`
- `apps/web/src/app/api/health/route.ts`
- `apps/web/src/app/api/readiness/route.ts`
- `apps/web/src/middleware.ts`
- `apps/web/src/server/http.ts`
- `apps/web/src/server/http.test.ts`
- `apps/web/src/server/logging.ts`

### 5. `security(desktop): isolate remote Teams renderers`

- `apps/desktop/main.js`
- `apps/desktop/package.json`
- `apps/desktop/preload-teams.js`
- `apps/desktop/security-check.cjs`
- `apps/desktop/README.md`

### 6. `test(db): add ephemeral PostgreSQL security suite`

- `docker-compose.integration.yml`
- `scripts/run-postgres-integration.mjs`
- `tests/integration/postgres-security.test.ts`
- `tests/integration/test-database-guard.ts`
- `vitest.integration.config.ts`

### 7. `test(db): validate migrations and synthetic upgrade`

- `tests/integration/fixtures/production-equivalent.sql`
- `tests/integration/upgrade-smoke.test.ts`
- `vitest.upgrade.config.ts`
- `scripts/run-postgres-integration.mjs` (compartido con el commit anterior)

Los commits 6 y 7 pueden fusionarse para evitar dividir artificialmente el
runner compartido.

### 8. `ops(db): enforce safe migration backup and restore workflows`

- `packages/database/prisma/seed.ts`
- `packages/database/src/seed-safety.ts`
- `packages/database/src/seed-safety.test.ts`
- `docker-migrate.sh`
- `docker-entrypoint.sh`
- `ops/backup-postgres.sh`
- `ops/upload-backup.sh`
- `ops/prune-backups.sh`
- `ops/restore-postgres.sh`
- `scripts/check-production-safety.mjs`
- `docs/operations/BACKUP_RESTORE.md`
- `docs/operations/MIGRATIONS.md`

### 9. `ops(deploy): add immutable promotion smoke and rollback workflow`

- `Dockerfile`
- `.gitignore`
- `docker-compose.yml`
- `scripts/build-immutable-image.mjs`
- `ops/deploy.sh`
- `ops/rollback.sh`
- `ops/smoke.sh`
- `docs/operations/DEPLOY_ROLLBACK.md`
- `DEPLOY.md`
- `package.json`
- `docs/operations/CHANGESET_PLAN.md`

## Verificación previa a cada commit

1. `git diff --cached --name-status` contiene sólo los paths del commit.
2. Los README ajenos no aparecen staged.
3. No hay `.env`, dumps, claves, manifests reales ni artefactos en el índice.
4. El gate correspondiente pasa.
