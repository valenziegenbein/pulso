-- P4: provider-neutral billing state and idempotent webhook inbox.
-- No prices, payment instruments or provider credentials are stored here.
BEGIN;

ALTER TABLE "OrganizationSubscription"
  ADD COLUMN "providerCustomerId" TEXT,
  ADD COLUMN "providerSubscriptionId" TEXT,
  ADD COLUMN "currentPeriodStart" TIMESTAMP(3),
  ADD COLUMN "currentPeriodEnd" TIMESTAMP(3),
  ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trialEndsAt" TIMESTAMP(3);

CREATE TABLE "BillingWebhookEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalEventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "payloadHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationSubscription_provider_providerSubscriptionId_key"
  ON "OrganizationSubscription"("provider", "providerSubscriptionId");
CREATE INDEX "OrganizationSubscription_provider_providerCustomerId_idx"
  ON "OrganizationSubscription"("provider", "providerCustomerId");
CREATE UNIQUE INDEX "BillingWebhookEvent_provider_externalEventId_key"
  ON "BillingWebhookEvent"("provider", "externalEventId");
CREATE INDEX "BillingWebhookEvent_organizationId_createdAt_idx"
  ON "BillingWebhookEvent"("organizationId", "createdAt");
CREATE INDEX "BillingWebhookEvent_status_createdAt_idx"
  ON "BillingWebhookEvent"("status", "createdAt");

ALTER TABLE "BillingWebhookEvent" ADD CONSTRAINT "BillingWebhookEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
