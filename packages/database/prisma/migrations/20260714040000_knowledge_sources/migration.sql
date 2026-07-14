CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "teamId" TEXT,
    "scope" TEXT NOT NULL,
    "clientProjectId" TEXT,
    "clientSourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "lastSyncId" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "heading" TEXT NOT NULL,
    "contentEncrypted" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "embeddingJson" TEXT NOT NULL,
    "syncId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KnowledgeSource_organizationId_ownerId_clientSourceId_key"
ON "KnowledgeSource"("organizationId", "ownerId", "clientSourceId");
CREATE UNIQUE INDEX "KnowledgeSource_id_organizationId_key" ON "KnowledgeSource"("id", "organizationId");
CREATE INDEX "KnowledgeSource_organizationId_scope_clientProjectId_idx"
ON "KnowledgeSource"("organizationId", "scope", "clientProjectId");
CREATE INDEX "KnowledgeSource_teamId_idx" ON "KnowledgeSource"("teamId");
CREATE INDEX "KnowledgeSource_ownerId_idx" ON "KnowledgeSource"("ownerId");

CREATE UNIQUE INDEX "KnowledgeChunk_sourceId_relativePath_ordinal_key"
ON "KnowledgeChunk"("sourceId", "relativePath", "ordinal");
CREATE INDEX "KnowledgeChunk_organizationId_sourceId_idx" ON "KnowledgeChunk"("organizationId", "sourceId");
CREATE INDEX "KnowledgeChunk_sourceId_syncId_idx" ON "KnowledgeChunk"("sourceId", "syncId");

ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_teamId_organizationId_fkey"
FOREIGN KEY ("teamId", "organizationId") REFERENCES "Team"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_sourceId_organizationId_fkey"
FOREIGN KEY ("sourceId", "organizationId") REFERENCES "KnowledgeSource"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
