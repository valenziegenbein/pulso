-- P1: reinforce tenant ownership in PostgreSQL itself.
-- The preflight runs before existing foreign keys are replaced. Any historical
-- cross-tenant relationship aborts the migration instead of being rewritten.

BEGIN;

ALTER TABLE "TeamMembership" ADD COLUMN "organizationId" TEXT;

UPDATE "TeamMembership" AS membership
SET "organizationId" = team."organizationId"
FROM "Team" AS team
WHERE team."id" = membership."teamId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "OrgMembership" AS membership
    JOIN "Role" AS role ON role."id" = membership."roleId"
    WHERE role."organizationId" <> membership."organizationId"
  ) THEN
    RAISE EXCEPTION 'tenant preflight failed: OrgMembership references a role from another organization';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "TeamMembership" AS membership
    JOIN "Role" AS role ON role."id" = membership."roleId"
    WHERE membership."organizationId" IS NULL
       OR role."organizationId" <> membership."organizationId"
       OR NOT EXISTS (
         SELECT 1
         FROM "OrgMembership" AS org_membership
         WHERE org_membership."organizationId" = membership."organizationId"
           AND org_membership."userId" = membership."userId"
       )
  ) THEN
    RAISE EXCEPTION 'tenant preflight failed: TeamMembership is not backed by a matching organization membership and role';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Task" AS task
    JOIN "Team" AS team ON team."id" = task."teamId"
    WHERE team."organizationId" <> task."organizationId"
  ) THEN
    RAISE EXCEPTION 'tenant preflight failed: Task references a team from another organization';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "DecisionRequest" AS decision
    JOIN "Team" AS team ON team."id" = decision."teamId"
    WHERE team."organizationId" <> decision."organizationId"
  ) THEN
    RAISE EXCEPTION 'tenant preflight failed: DecisionRequest references a team from another organization';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Attachment" AS attachment
    LEFT JOIN "Task" AS task ON task."id" = attachment."taskId"
    LEFT JOIN "WorklogEntry" AS worklog ON worklog."id" = attachment."worklogEntryId"
    WHERE (task."id" IS NOT NULL AND task."organizationId" <> attachment."organizationId")
       OR (worklog."id" IS NOT NULL AND worklog."organizationId" <> attachment."organizationId")
  ) THEN
    RAISE EXCEPTION 'tenant preflight failed: Attachment references an entity from another organization';
  END IF;
END $$;

ALTER TABLE "TeamMembership" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_taskId_fkey";
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_worklogEntryId_fkey";
ALTER TABLE "DecisionRequest" DROP CONSTRAINT "DecisionRequest_teamId_fkey";
ALTER TABLE "OrgMembership" DROP CONSTRAINT "OrgMembership_roleId_fkey";
ALTER TABLE "Task" DROP CONSTRAINT "Task_teamId_fkey";
ALTER TABLE "TeamMembership" DROP CONSTRAINT "TeamMembership_roleId_fkey";
ALTER TABLE "TeamMembership" DROP CONSTRAINT "TeamMembership_teamId_fkey";

CREATE UNIQUE INDEX "Role_id_organizationId_key" ON "Role"("id", "organizationId");
CREATE UNIQUE INDEX "Task_id_organizationId_key" ON "Task"("id", "organizationId");
CREATE UNIQUE INDEX "Team_id_organizationId_key" ON "Team"("id", "organizationId");
CREATE INDEX "TeamMembership_organizationId_userId_idx" ON "TeamMembership"("organizationId", "userId");
CREATE UNIQUE INDEX "WorklogEntry_id_organizationId_key" ON "WorklogEntry"("id", "organizationId");

ALTER TABLE "OrgMembership"
  ADD CONSTRAINT "OrgMembership_roleId_organizationId_fkey"
  FOREIGN KEY ("roleId", "organizationId")
  REFERENCES "Role"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TeamMembership"
  ADD CONSTRAINT "TeamMembership_teamId_organizationId_fkey"
  FOREIGN KEY ("teamId", "organizationId")
  REFERENCES "Team"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamMembership"
  ADD CONSTRAINT "TeamMembership_roleId_organizationId_fkey"
  FOREIGN KEY ("roleId", "organizationId")
  REFERENCES "Role"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TeamMembership"
  ADD CONSTRAINT "TeamMembership_organizationId_userId_fkey"
  FOREIGN KEY ("organizationId", "userId")
  REFERENCES "OrgMembership"("organizationId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_teamId_organizationId_fkey"
  FOREIGN KEY ("teamId", "organizationId")
  REFERENCES "Team"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DecisionRequest"
  ADD CONSTRAINT "DecisionRequest_teamId_organizationId_fkey"
  FOREIGN KEY ("teamId", "organizationId")
  REFERENCES "Team"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_taskId_organizationId_fkey"
  FOREIGN KEY ("taskId", "organizationId")
  REFERENCES "Task"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_worklogEntryId_organizationId_fkey"
  FOREIGN KEY ("worklogEntryId", "organizationId")
  REFERENCES "WorklogEntry"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
