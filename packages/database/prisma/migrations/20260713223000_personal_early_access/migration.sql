-- Persisted, auditable Personal early-access requests replace operational
-- allowlist edits while keeping provider credentials outside the database.
CREATE TABLE "EarlyAccessRequest" (
    "id" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'MARKETING_CONTACT',
    "message" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "lastRequestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisionAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "decisionById" TEXT,
    "userId" TEXT,
    "personalOrganizationId" TEXT,
    "claimTokenHash" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EarlyAccessRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EarlyAccessRequest_product_check" CHECK ("product" IN ('PERSONAL_AI', 'PERSONAL_LOCAL')),
    CONSTRAINT "EarlyAccessRequest_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED')),
    CONSTRAINT "EarlyAccessRequest_requestCount_check" CHECK ("requestCount" > 0),
    CONSTRAINT "EarlyAccessRequest_claim_check" CHECK (("claimTokenHash" IS NULL) = ("claimExpiresAt" IS NULL))
);

CREATE TABLE "EarlyAccessEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarlyAccessEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EarlyAccessRequest_claimTokenHash_key" ON "EarlyAccessRequest"("claimTokenHash");
CREATE UNIQUE INDEX "EarlyAccessRequest_normalizedEmail_product_key" ON "EarlyAccessRequest"("normalizedEmail", "product");
CREATE INDEX "EarlyAccessRequest_status_lastRequestedAt_idx" ON "EarlyAccessRequest"("status", "lastRequestedAt");
CREATE INDEX "EarlyAccessRequest_userId_idx" ON "EarlyAccessRequest"("userId");
CREATE INDEX "EarlyAccessRequest_personalOrganizationId_idx" ON "EarlyAccessRequest"("personalOrganizationId");
CREATE INDEX "EarlyAccessEvent_requestId_createdAt_idx" ON "EarlyAccessEvent"("requestId", "createdAt");
CREATE INDEX "EarlyAccessEvent_actorId_createdAt_idx" ON "EarlyAccessEvent"("actorId", "createdAt");

ALTER TABLE "EarlyAccessRequest"
  ADD CONSTRAINT "EarlyAccessRequest_decisionById_fkey"
  FOREIGN KEY ("decisionById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EarlyAccessRequest"
  ADD CONSTRAINT "EarlyAccessRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EarlyAccessRequest"
  ADD CONSTRAINT "EarlyAccessRequest_personalOrganizationId_fkey"
  FOREIGN KEY ("personalOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EarlyAccessEvent"
  ADD CONSTRAINT "EarlyAccessEvent_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "EarlyAccessRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EarlyAccessEvent"
  ADD CONSTRAINT "EarlyAccessEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
