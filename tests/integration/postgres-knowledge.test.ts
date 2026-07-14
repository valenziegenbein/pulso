import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS } from '@pulso/domain';
import { prisma } from '@pulso/database';
import type { AuthContext } from '@/lib/auth/context';
import { retrieveCloudKnowledge, syncKnowledgeBatch } from '@/server/knowledge';

const orgA = 'knowledge-org-a';
const orgB = 'knowledge-org-b';
const userA = 'knowledge-user-a';
const userB = 'knowledge-user-b';
const outsider = 'knowledge-outsider';
const teamA = 'knowledge-team-a';
const teamLocked = 'knowledge-team-locked';

function ctx(userId: string, organizationId: string): AuthContext {
  return {
    user: { id: userId, name: userId, email: `${userId}@integration.invalid` },
    organizationId,
    organizationName: organizationId,
    role: 'MEMBER',
    permissions: DEFAULT_ROLE_PERMISSIONS.MEMBER,
    isSuperAdmin: false,
  };
}

beforeAll(async () => {
  process.env.WORKLOG_ENCRYPTION_KEY = '11'.repeat(32);
  process.env.PULSO_PERSONAL_ACCOUNT_AI_GEMINI_API_KEY = 'synthetic-key';
  process.env.PULSO_PERSONAL_ACCOUNT_AI_DATA_TERMS_ACK = 'paid-service-no-training';
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { requests?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return Response.json({
      embeddings: (body.requests ?? []).map((request) => {
        const text = request.content?.parts?.[0]?.text ?? '';
        return { values: /alpha|diseño/i.test(text) ? [1, 0] : [0, 1] };
      }),
    });
  }));
  await prisma.organization.createMany({ data: [
    { id: orgA, name: 'Knowledge A', slug: 'knowledge-a' },
    { id: orgB, name: 'Knowledge B', slug: 'knowledge-b' },
  ] });
  await prisma.user.createMany({ data: [userA, userB, outsider].map((id) => ({
    id, email: `${id}@integration.invalid`, normalizedEmail: `${id}@integration.invalid`, name: id, passwordHash: 'synthetic',
  })) });
  await prisma.role.createMany({ data: [
    { id: 'knowledge-role-a', organizationId: orgA, key: 'MEMBER', name: 'Member', permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS.MEMBER) },
    { id: 'knowledge-role-b', organizationId: orgB, key: 'MEMBER', name: 'Member', permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS.MEMBER) },
  ] });
  await prisma.orgMembership.createMany({ data: [
    { id: 'knowledge-om-a', organizationId: orgA, userId: userA, roleId: 'knowledge-role-a' },
    { id: 'knowledge-om-outsider', organizationId: orgA, userId: outsider, roleId: 'knowledge-role-a' },
    { id: 'knowledge-om-b', organizationId: orgB, userId: userB, roleId: 'knowledge-role-b' },
  ] });
  await prisma.team.createMany({ data: [
    { id: teamA, organizationId: orgA, name: 'Equipo knowledge' },
    { id: teamLocked, organizationId: orgA, name: 'Equipo no asignado' },
  ] });
  await prisma.teamMembership.create({ data: {
    id: 'knowledge-tm-a', organizationId: orgA, teamId: teamA, userId: userA, roleId: 'knowledge-role-a',
  } });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await prisma.teamMembership.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB, outsider] } } });
});

describe('PostgreSQL knowledge sync', () => {
  it('cifra, indexa, recupera y elimina chunks obsoletos de un proyecto Personal', async () => {
    const input = {
      scope: 'PERSONAL' as const,
      clientProjectId: 'local-project-a',
      clientSourceId: 'a'.repeat(64),
      sourceName: 'Bóveda sintética',
      syncId: 'sync_personal_0001',
      consentAt: new Date().toISOString(),
      chunks: [
        { relativePath: 'docs/alpha.md', ordinal: 0, heading: 'Diseño Alpha', text: 'El contrato alpha usa aislamiento estricto.' },
        { relativePath: 'docs/beta.md', ordinal: 0, heading: 'Beta', text: 'La guía beta describe operaciones.' },
      ],
    };
    await syncKnowledgeBatch(ctx(userA, orgA), input);
    const done = await syncKnowledgeBatch(ctx(userA, orgA), { ...input, chunks: [], complete: true });
    expect(done).toMatchObject({ fileCount: 2, chunkCount: 2 });
    const stored = await prisma.knowledgeChunk.findFirstOrThrow({ where: { organizationId: orgA } });
    expect(stored.contentEncrypted).not.toContain('aislamiento estricto');
    await expect(retrieveCloudKnowledge(ctx(userA, orgA), {
      scope: 'PERSONAL', clientProjectId: 'local-project-a', query: 'diseño alpha',
    })).resolves.toContain('aislamiento estricto');

    const next = { ...input, syncId: 'sync_personal_0002', chunks: [input.chunks[0]!] };
    await syncKnowledgeBatch(ctx(userA, orgA), next);
    const finalized = await syncKnowledgeBatch(ctx(userA, orgA), { ...next, chunks: [], complete: true });
    expect(finalized).toMatchObject({ fileCount: 1, chunkCount: 1 });
  });

  it('aísla organizaciones y exige pertenencia al equipo para fuentes Teams', async () => {
    const teamInput = {
      scope: 'TEAM' as const,
      teamId: teamA,
      clientSourceId: 'b'.repeat(64),
      sourceName: 'Equipo',
      syncId: 'sync_team_0000001',
      consentAt: new Date().toISOString(),
      chunks: [{ relativePath: 'team/alpha.md', ordinal: 0, heading: 'Alpha', text: 'Contexto privado del equipo alpha.' }],
      complete: true,
    };
    await syncKnowledgeBatch(ctx(userA, orgA), teamInput);
    await expect(retrieveCloudKnowledge(ctx(userB, orgB), {
      scope: 'PERSONAL', clientProjectId: 'local-project-a', query: 'alpha',
    })).resolves.toBeNull();
    await expect(syncKnowledgeBatch(ctx(outsider, orgA), { ...teamInput, teamId: teamLocked, clientSourceId: 'c'.repeat(64) }))
      .rejects.toMatchObject({ name: 'AuthorizationError' });
  });
});
