-- P3: non-commercial plan definitions, ownership, seats and AI usage ledger.
BEGIN;

ALTER TABLE "OrgMembership" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PlanDefinition" (
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "defaultSeatLimit" INTEGER NOT NULL,
  "managedAiIncludedUnits" INTEGER NOT NULL DEFAULT 0,
  "allowByok" BOOLEAN NOT NULL DEFAULT true,
  "allowLocalAi" BOOLEAN NOT NULL DEFAULT true,
  "customizableSeats" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanDefinition_pkey" PRIMARY KEY ("key")
);

INSERT INTO "PlanDefinition" ("key", "name", "defaultSeatLimit", "managedAiIncludedUnits", "customizableSeats", "updatedAt") VALUES
  ('FREE', 'Free', 5, 0, false, CURRENT_TIMESTAMP),
  ('TEAM', 'Team', 15, 0, false, CURRENT_TIMESTAMP),
  ('BUSINESS', 'Business', 50, 0, false, CURRENT_TIMESTAMP),
  ('ENTERPRISE', 'Enterprise', 50, 0, true, CURRENT_TIMESTAMP);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Organization" WHERE "planKey" NOT IN ('FREE', 'TEAM', 'BUSINESS', 'ENTERPRISE')) THEN
    RAISE EXCEPTION 'entitlements preflight failed: unknown organization planKey';
  END IF;
END $$;

CREATE TABLE "OrganizationSubscription" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "planKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "provider" TEXT NOT NULL DEFAULT 'MOCK',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationSubscription_pkey" PRIMARY KEY ("id")
);

INSERT INTO "OrganizationSubscription" ("id", "organizationId", "planKey", "status", "provider", "updatedAt")
SELECT 'sub_' || "id", "id", "planKey", 'ACTIVE', 'MOCK', CURRENT_TIMESTAMP FROM "Organization";

CREATE TABLE "UsageLedger" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "units" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AIUsageEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "providerType" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "inputTokens" INTEGER NOT NULL,
  "outputTokens" INTEGER NOT NULL,
  "managed" BOOLEAN NOT NULL DEFAULT false,
  "idempotencyKey" TEXT NOT NULL,
  "ledgerEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AIUsageEvent_pkey" PRIMARY KEY ("id")
);

WITH ranked_admins AS (
  SELECT membership."id", row_number() OVER (
    PARTITION BY membership."organizationId" ORDER BY membership."createdAt", membership."id"
  ) AS position
  FROM "OrgMembership" membership
  JOIN "Role" role ON role."id" = membership."roleId" AND role."organizationId" = membership."organizationId"
  WHERE role."key" IN ('ORG_ADMIN', 'SUPER_ADMIN') AND membership."status" = 'ACTIVE'
)
UPDATE "OrgMembership" membership SET "isOwner" = true
FROM ranked_admins WHERE ranked_admins."id" = membership."id" AND ranked_admins.position = 1;

CREATE UNIQUE INDEX "OrganizationSubscription_organizationId_key" ON "OrganizationSubscription"("organizationId");
CREATE INDEX "OrganizationSubscription_planKey_status_idx" ON "OrganizationSubscription"("planKey", "status");
CREATE UNIQUE INDEX "UsageLedger_idempotencyKey_key" ON "UsageLedger"("idempotencyKey");
CREATE INDEX "UsageLedger_organizationId_kind_periodStart_idx" ON "UsageLedger"("organizationId", "kind", "periodStart");
CREATE UNIQUE INDEX "AIUsageEvent_idempotencyKey_key" ON "AIUsageEvent"("idempotencyKey");
CREATE UNIQUE INDEX "AIUsageEvent_ledgerEntryId_key" ON "AIUsageEvent"("ledgerEntryId");
CREATE INDEX "AIUsageEvent_organizationId_createdAt_idx" ON "AIUsageEvent"("organizationId", "createdAt");

ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_planKey_fkey" FOREIGN KEY ("planKey") REFERENCES "PlanDefinition"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UsageLedger" ADD CONSTRAINT "UsageLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIUsageEvent" ADD CONSTRAINT "AIUsageEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIUsageEvent" ADD CONSTRAINT "AIUsageEvent_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "UsageLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
