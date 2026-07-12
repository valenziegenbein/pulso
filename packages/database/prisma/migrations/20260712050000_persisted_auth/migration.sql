-- P2: persisted, revocable auth and hashed one-time credentials.
BEGIN;

ALTER TABLE "OrgMembership"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "User"
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "normalizedEmail" TEXT,
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
  ADD COLUMN "securityVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "User"
SET "normalizedEmail" = lower(trim("email")),
    "emailVerifiedAt" = COALESCE("emailVerifiedAt", "createdAt"),
    "updatedAt" = CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF EXISTS (
    SELECT "normalizedEmail"
    FROM "User"
    GROUP BY "normalizedEmail"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'auth preflight failed: case-insensitive duplicate user emails';
  END IF;
END $$;

ALTER TABLE "User"
  ALTER COLUMN "normalizedEmail" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE TABLE "AuthSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "activeOrganizationId" TEXT,
  "securityVersion" INTEGER NOT NULL,
  "deviceName" TEXT,
  "userAgentHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganizationInvite" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "normalizedEmail" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "teamId" TEXT,
  "tokenHash" TEXT NOT NULL,
  "pendingKey" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "invitedById" TEXT NOT NULL,
  "acceptedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  CONSTRAINT "OrganizationInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DesktopAuthorizationCode" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "activeOrganizationId" TEXT,
  "codeChallenge" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  CONSTRAINT "DesktopAuthorizationCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthRateLimitBucket" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "blockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthRateLimitBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_revokedAt_expiresAt_idx" ON "AuthSession"("userId", "revokedAt", "expiresAt");
CREATE INDEX "AuthSession_activeOrganizationId_idx" ON "AuthSession"("activeOrganizationId");
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");
CREATE INDEX "VerificationToken_userId_expiresAt_idx" ON "VerificationToken"("userId", "expiresAt");
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");
CREATE UNIQUE INDEX "OrganizationInvite_tokenHash_key" ON "OrganizationInvite"("tokenHash");
CREATE UNIQUE INDEX "OrganizationInvite_pendingKey_key" ON "OrganizationInvite"("pendingKey");
CREATE INDEX "OrganizationInvite_organizationId_normalizedEmail_status_idx" ON "OrganizationInvite"("organizationId", "normalizedEmail", "status");
CREATE INDEX "OrganizationInvite_teamId_idx" ON "OrganizationInvite"("teamId");
CREATE INDEX "OrganizationInvite_expiresAt_idx" ON "OrganizationInvite"("expiresAt");
CREATE UNIQUE INDEX "DesktopAuthorizationCode_codeHash_key" ON "DesktopAuthorizationCode"("codeHash");
CREATE INDEX "DesktopAuthorizationCode_userId_expiresAt_idx" ON "DesktopAuthorizationCode"("userId", "expiresAt");
CREATE UNIQUE INDEX "AuthRateLimitBucket_action_keyHash_key" ON "AuthRateLimitBucket"("action", "keyHash");
CREATE INDEX "AuthRateLimitBucket_blockedUntil_idx" ON "AuthRateLimitBucket"("blockedUntil");
CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_activeOrganizationId_fkey"
  FOREIGN KEY ("activeOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_roleId_organizationId_fkey"
  FOREIGN KEY ("roleId", "organizationId") REFERENCES "Role"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_invitedById_fkey"
  FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_acceptedById_fkey"
  FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DesktopAuthorizationCode" ADD CONSTRAINT "DesktopAuthorizationCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesktopAuthorizationCode" ADD CONSTRAINT "DesktopAuthorizationCode_activeOrganizationId_fkey"
  FOREIGN KEY ("activeOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
