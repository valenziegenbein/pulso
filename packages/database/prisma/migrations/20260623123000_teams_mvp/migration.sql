-- Additive Teams MVP fields.
ALTER TABLE "Team" ADD COLUMN "description" TEXT;
ALTER TABLE "Task" ADD COLUMN "expectedOutcome" TEXT;
ALTER TABLE "WorklogEntry" ADD COLUMN "teamId" TEXT REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "WorklogEntry"
SET "teamId" = (
  SELECT "teamId" FROM "Task" WHERE "Task"."id" = "WorklogEntry"."taskId"
)
WHERE "taskId" IS NOT NULL;

CREATE INDEX "WorklogEntry_teamId_createdAt_idx" ON "WorklogEntry"("teamId", "createdAt");

-- Rebuild Blocker to support team/org-level blockers and explicit status/title.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Blocker" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT,
  "teamId" TEXT,
  "taskId" TEXT,
  "title" TEXT NOT NULL DEFAULT 'Bloqueo',
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" DATETIME,
  CONSTRAINT "Blocker_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Blocker_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Blocker_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Blocker_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_Blocker" ("id", "organizationId", "teamId", "taskId", "title", "description", "status", "createdById", "createdAt", "resolvedAt")
SELECT
  "Blocker"."id",
  (SELECT "organizationId" FROM "Task" WHERE "Task"."id" = "Blocker"."taskId"),
  (SELECT "teamId" FROM "Task" WHERE "Task"."id" = "Blocker"."taskId"),
  "Blocker"."taskId",
  'Bloqueo',
  "Blocker"."description",
  CASE WHEN "Blocker"."resolvedAt" IS NULL THEN 'OPEN' ELSE 'RESOLVED' END,
  "Blocker"."createdById",
  "Blocker"."createdAt",
  "Blocker"."resolvedAt"
FROM "Blocker";

DROP TABLE "Blocker";
ALTER TABLE "new_Blocker" RENAME TO "Blocker";

PRAGMA foreign_keys=ON;

CREATE INDEX "Blocker_organizationId_status_idx" ON "Blocker"("organizationId", "status");
CREATE INDEX "Blocker_teamId_status_idx" ON "Blocker"("teamId", "status");
CREATE INDEX "Blocker_taskId_idx" ON "Blocker"("taskId");

CREATE TABLE "DecisionRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "taskId" TEXT,
  "requestedById" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" DATETIME,
  CONSTRAINT "DecisionRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DecisionRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DecisionRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DecisionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DecisionRequest_organizationId_status_idx" ON "DecisionRequest"("organizationId", "status");
CREATE INDEX "DecisionRequest_teamId_status_idx" ON "DecisionRequest"("teamId", "status");
CREATE INDEX "DecisionRequest_taskId_idx" ON "DecisionRequest"("taskId");
CREATE INDEX "DecisionRequest_requestedById_idx" ON "DecisionRequest"("requestedById");
