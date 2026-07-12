-- P6: bind every provider checkout to a server-side, versioned commercial quote.
-- Webhooks resolve tenant, plan and amount through this table; provider payloads
-- are never allowed to select an organization directly.
BEGIN;

CREATE TABLE "BillingCheckoutAttempt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "priceVersionId" TEXT NOT NULL,
  "planKey" TEXT NOT NULL,
  "seats" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "listAmountCentavos" INTEGER NOT NULL,
  "chargedAmountCentavos" INTEGER NOT NULL,
  "discountBps" INTEGER NOT NULL,
  "discountMonths" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "providerCheckoutId" TEXT,
  "providerSubscriptionId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingCheckoutAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingCheckoutAttempt_amount_check" CHECK (
    "listAmountCentavos" > 0 AND
    "chargedAmountCentavos" > 0 AND
    "chargedAmountCentavos" <= "listAmountCentavos"
  ),
  CONSTRAINT "BillingCheckoutAttempt_discount_check" CHECK (
    "discountBps" >= 0 AND "discountBps" < 10000 AND "discountMonths" >= 0
  ),
  CONSTRAINT "BillingCheckoutAttempt_seats_check" CHECK ("seats" > 0),
  CONSTRAINT "BillingCheckoutAttempt_currency_check" CHECK ("currency" = 'ARS')
);

CREATE UNIQUE INDEX "BillingCheckoutAttempt_provider_providerCheckoutId_key"
  ON "BillingCheckoutAttempt"("provider", "providerCheckoutId");
CREATE UNIQUE INDEX "BillingCheckoutAttempt_provider_providerSubscriptionId_key"
  ON "BillingCheckoutAttempt"("provider", "providerSubscriptionId");
CREATE INDEX "BillingCheckoutAttempt_organizationId_status_createdAt_idx"
  ON "BillingCheckoutAttempt"("organizationId", "status", "createdAt");
CREATE INDEX "BillingCheckoutAttempt_createdById_createdAt_idx"
  ON "BillingCheckoutAttempt"("createdById", "createdAt");
CREATE INDEX "BillingCheckoutAttempt_expiresAt_idx"
  ON "BillingCheckoutAttempt"("expiresAt");

ALTER TABLE "BillingCheckoutAttempt" ADD CONSTRAINT "BillingCheckoutAttempt_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingCheckoutAttempt" ADD CONSTRAINT "BillingCheckoutAttempt_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
