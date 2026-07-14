import { createHash } from 'node:crypto';
import { decryptSecret, encryptSecret, prisma } from '@pulso/database';
import type { AuthContext } from '@/lib/auth/context';
import { assertTeamAccess } from '@/server/authz';
import {
  embedPersonalAccountTexts,
  personalAccountAiEmbeddingModel,
} from '@/server/personal-account-ai';

const MAX_BATCH_CHUNKS = 24;
const MAX_CHUNK_CHARS = 4_000;
const MAX_SEARCH_CHUNKS = 4_000;

export type KnowledgeScope = 'PERSONAL' | 'TEAM';

export interface KnowledgeChunkInput {
  relativePath: string;
  ordinal: number;
  heading: string;
  text: string;
}

export interface KnowledgeSyncInput {
  scope: KnowledgeScope;
  clientProjectId?: string;
  teamId?: string;
  clientSourceId: string;
  sourceName: string;
  syncId: string;
  consentAt: string;
  chunks: KnowledgeChunkInput[];
  complete?: boolean;
}

export class KnowledgeInputError extends Error {}

export async function syncKnowledgeBatch(ctx: AuthContext, input: KnowledgeSyncInput) {
  validateSyncInput(input);
  if (input.scope === 'TEAM') await assertTeamAccess(ctx, input.teamId!);

  const existing = await prisma.knowledgeSource.findUnique({
    where: {
      organizationId_ownerId_clientSourceId: {
        organizationId: ctx.organizationId,
        ownerId: ctx.user.id,
        clientSourceId: input.clientSourceId,
      },
    },
  });
  if (existing && (
    existing.scope !== input.scope
    || existing.teamId !== (input.teamId ?? null)
    || existing.clientProjectId !== (input.clientProjectId ?? null)
  )) {
    throw new KnowledgeInputError('La fuente no puede cambiar de alcance.');
  }

  const source = existing ?? await prisma.knowledgeSource.create({
    data: {
      organizationId: ctx.organizationId,
      ownerId: ctx.user.id,
      teamId: input.teamId ?? null,
      scope: input.scope,
      clientProjectId: input.clientProjectId ?? null,
      clientSourceId: input.clientSourceId,
      name: input.sourceName.trim(),
      consentAt: new Date(input.consentAt),
    },
  });

  const normalized = input.chunks.map(normalizeChunk);
  const current = normalized.length
    ? await prisma.knowledgeChunk.findMany({ where: { sourceId: source.id } })
    : [];
  const currentByKey = new Map(current.map((chunk) => [`${chunk.relativePath}\0${chunk.ordinal}`, chunk]));
  const model = personalAccountAiEmbeddingModel();
  const changed = normalized.filter((chunk) => {
    const row = currentByKey.get(`${chunk.relativePath}\0${chunk.ordinal}`);
    return !row || row.contentHash !== chunk.contentHash || row.embeddingModel !== model;
  });
  const vectors = changed.length
    ? await embedPersonalAccountTexts(changed.map((chunk) => `${chunk.heading}\n${chunk.text}`), 'RETRIEVAL_DOCUMENT')
    : [];
  const vectorByKey = new Map(changed.map((chunk, index) => [
    `${chunk.relativePath}\0${chunk.ordinal}`,
    vectors[index],
  ]));

  await prisma.$transaction(normalized.map((chunk) => {
    const key = `${chunk.relativePath}\0${chunk.ordinal}`;
    const previous = currentByKey.get(key);
    const vector = vectorByKey.get(key);
    const data = vector
      ? {
          heading: chunk.heading,
          contentEncrypted: encryptSecret(chunk.text),
          contentHash: chunk.contentHash,
          embeddingModel: model,
          embeddingJson: JSON.stringify(vector),
          syncId: input.syncId,
        }
      : { syncId: input.syncId };
    return prisma.knowledgeChunk.upsert({
      where: { sourceId_relativePath_ordinal: { sourceId: source.id, relativePath: chunk.relativePath, ordinal: chunk.ordinal } },
      create: {
        organizationId: ctx.organizationId,
        sourceId: source.id,
        relativePath: chunk.relativePath,
        ordinal: chunk.ordinal,
        heading: chunk.heading,
        contentEncrypted: vector ? encryptSecret(chunk.text) : previous!.contentEncrypted,
        contentHash: chunk.contentHash,
        embeddingModel: model,
        embeddingJson: vector ? JSON.stringify(vector) : previous!.embeddingJson,
        syncId: input.syncId,
      },
      update: data,
    });
  }));

  if (!input.complete) return { sourceId: source.id, accepted: normalized.length, complete: false };

  await prisma.knowledgeChunk.deleteMany({ where: { sourceId: source.id, syncId: { not: input.syncId } } });
  const remaining = await prisma.knowledgeChunk.findMany({
    where: { sourceId: source.id },
    select: { relativePath: true },
  });
  const updated = await prisma.knowledgeSource.update({
    where: { id: source.id },
    data: {
      name: input.sourceName.trim(),
      lastSyncId: input.syncId,
      lastSyncedAt: new Date(),
      fileCount: new Set(remaining.map((chunk) => chunk.relativePath)).size,
      chunkCount: remaining.length,
    },
  });
  return {
    sourceId: source.id,
    accepted: normalized.length,
    complete: true,
    fileCount: updated.fileCount,
    chunkCount: updated.chunkCount,
  };
}

export async function retrieveCloudKnowledge(
  ctx: AuthContext,
  input: { scope: KnowledgeScope; query: string; clientProjectId?: string; teamId?: string; maxChars?: number },
): Promise<string | null> {
  const query = input.query.trim();
  if (!query) return null;
  if (input.scope === 'TEAM') {
    if (!input.teamId) throw new KnowledgeInputError('Falta el equipo.');
    await assertTeamAccess(ctx, input.teamId);
  }
  const sources = await prisma.knowledgeSource.findMany({
    where: input.scope === 'PERSONAL'
      ? {
          organizationId: ctx.organizationId,
          ownerId: ctx.user.id,
          scope: 'PERSONAL',
          clientProjectId: input.clientProjectId,
        }
      : { organizationId: ctx.organizationId, scope: 'TEAM', teamId: input.teamId },
    select: { id: true },
  });
  if (sources.length === 0) return null;

  const model = personalAccountAiEmbeddingModel();
  const [queryVector] = await embedPersonalAccountTexts([query.slice(0, MAX_CHUNK_CHARS)], 'RETRIEVAL_QUERY');
  if (!queryVector) return null;
  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      organizationId: ctx.organizationId,
      sourceId: { in: sources.map((source) => source.id) },
      embeddingModel: model,
    },
    take: MAX_SEARCH_CHUNKS,
  });
  const ranked = chunks
    .map((chunk) => ({ chunk, score: cosine(queryVector, parseVector(chunk.embeddingJson)) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 12);
  const budget = Math.min(Math.max(input.maxChars ?? 3_000, 500), 8_000);
  const parts: string[] = [];
  let used = 0;
  for (const { chunk } of ranked) {
    if (used >= budget) break;
    let text: string;
    try {
      text = decryptSecret(chunk.contentEncrypted);
    } catch {
      continue;
    }
    const excerpt = text.slice(0, budget - used);
    parts.push(`— ${chunk.relativePath}${chunk.heading ? ` › ${chunk.heading}` : ''} —\n${excerpt}`);
    used += excerpt.length;
  }
  return parts.length ? parts.join('\n\n') : null;
}

export async function listKnowledgeTargets(ctx: AuthContext) {
  const allTeams = ctx.role === 'SUPER_ADMIN' || ctx.role === 'ORG_ADMIN';
  const teams = await prisma.team.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(allTeams ? {} : { memberships: { some: { userId: ctx.user.id } } }),
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const sources = await prisma.knowledgeSource.findMany({
    where: { organizationId: ctx.organizationId, ownerId: ctx.user.id },
    select: { id: true, name: true, scope: true, teamId: true, fileCount: true, chunkCount: true, lastSyncedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  return { teams, sources };
}

export async function deleteKnowledgeSource(ctx: AuthContext, sourceId: string): Promise<boolean> {
  if (!/^[a-z0-9_-]{10,40}$/i.test(sourceId)) throw new KnowledgeInputError('Fuente inválida.');
  const result = await prisma.knowledgeSource.deleteMany({
    where: { id: sourceId, organizationId: ctx.organizationId, ownerId: ctx.user.id },
  });
  return result.count === 1;
}

function validateSyncInput(input: KnowledgeSyncInput): void {
  if (!['PERSONAL', 'TEAM'].includes(input.scope)) throw new KnowledgeInputError('Alcance inválido.');
  if (input.scope === 'PERSONAL' && (!input.clientProjectId || input.teamId)) throw new KnowledgeInputError('Proyecto personal inválido.');
  if (input.scope === 'TEAM' && (!input.teamId || input.clientProjectId)) throw new KnowledgeInputError('Equipo inválido.');
  if (!/^[a-f0-9]{64}$/.test(input.clientSourceId)) throw new KnowledgeInputError('Fuente inválida.');
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(input.syncId)) throw new KnowledgeInputError('Sincronización inválida.');
  if (!input.sourceName.trim() || input.sourceName.length > 120) throw new KnowledgeInputError('Nombre inválido.');
  if (!Number.isFinite(new Date(input.consentAt).getTime())) throw new KnowledgeInputError('Consentimiento inválido.');
  if (!Array.isArray(input.chunks) || input.chunks.length > MAX_BATCH_CHUNKS) throw new KnowledgeInputError('Lote inválido.');
}

function normalizeChunk(input: KnowledgeChunkInput) {
  const relativePath = input.relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!relativePath || relativePath.length > 300 || relativePath.startsWith('/') || relativePath.split('/').includes('..')) {
    throw new KnowledgeInputError('Ruta relativa inválida.');
  }
  if (!Number.isInteger(input.ordinal) || input.ordinal < 0 || input.ordinal > 10_000) throw new KnowledgeInputError('Ordinal inválido.');
  const heading = input.heading.trim().slice(0, 200);
  const text = input.text.trim();
  if (!text || text.length > MAX_CHUNK_CHARS) throw new KnowledgeInputError('Contenido inválido.');
  return {
    relativePath,
    ordinal: input.ordinal,
    heading,
    text,
    contentHash: createHash('sha256').update(`${heading}\n${text}`).digest('hex'),
  };
}

function parseVector(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is number => Number.isFinite(value)) : [];
  } catch {
    return [];
  }
}

function cosine(left: number[], right: number[]): number {
  const size = Math.min(left.length, right.length);
  if (size === 0) return -1;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < size; index++) {
    dot += left[index]! * right[index]!;
    leftNorm += left[index]! ** 2;
    rightNorm += right[index]! ** 2;
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return denominator ? dot / denominator : -1;
}
