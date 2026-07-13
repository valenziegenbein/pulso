import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS } from '@pulso/domain';
import type { AuthContext } from '@/lib/auth/context';

const prisma = vi.hoisted(() => ({
  teamMembership: { findMany: vi.fn(), findFirst: vi.fn() },
  team: { findFirst: vi.fn() },
  task: { findFirst: vi.fn() },
  worklogEntry: { findFirst: vi.fn() },
  decisionRequest: { findFirst: vi.fn() },
  orgMembership: { findUnique: vi.fn(), count: vi.fn() },
  role: { findUnique: vi.fn() },
}));

vi.mock('@pulso/database', () => ({ prisma }));

import {
  assertTaskAccess,
  assertTeamAccess,
  assertWorklogAccess,
  canViewWorklog,
  getAuthorizedUser,
} from './authz';

const teams = [
  { id: 'team-a', organizationId: 'org-a' },
  { id: 'team-a2', organizationId: 'org-a' },
  { id: 'team-b', organizationId: 'org-b' },
];
const tasks = [
  { id: 'task-a', organizationId: 'org-a', teamId: 'team-a', assigneeId: 'member-a' },
  { id: 'task-b', organizationId: 'org-b', teamId: 'team-b', assigneeId: 'member-b' },
];
const worklogs = [
  { id: 'draft-a', organizationId: 'org-a', teamId: 'team-a', authorId: 'member-a', status: 'DRAFT' },
  { id: 'draft-other', organizationId: 'org-a', teamId: 'team-a', authorId: 'member-other', status: 'DRAFT' },
  { id: 'published-team-a', organizationId: 'org-a', teamId: 'team-a', authorId: 'member-other', status: 'PUBLISHED' },
  { id: 'published-team-a2', organizationId: 'org-a', teamId: 'team-a2', authorId: 'member-other', status: 'PUBLISHED' },
  { id: 'worklog-b', organizationId: 'org-b', teamId: 'team-b', authorId: 'member-b', status: 'PUBLISHED' },
];

function context(role: AuthContext['role'], userId: string, organizationId = 'org-a'): AuthContext {
  return {
    user: { id: userId, name: userId, email: `${userId}@test.invalid` },
    organizationId,
    organizationName: organizationId,
    role,
    permissions: DEFAULT_ROLE_PERMISSIONS[role],
    isSuperAdmin: role === 'SUPER_ADMIN',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.teamMembership.findMany.mockImplementation(({ where }: { where: { userId: string; team: { organizationId: string } } }) => {
    if (where.userId === 'team-admin') return Promise.resolve([{ teamId: 'team-a' }]);
    if (where.userId === 'member-a') return Promise.resolve([{ teamId: 'team-a' }]);
    return Promise.resolve([]);
  });
  prisma.team.findFirst.mockImplementation(({ where }: { where: { id: string; organizationId: string } }) =>
    Promise.resolve(teams.find((team) => team.id === where.id && team.organizationId === where.organizationId) ?? null));
  prisma.task.findFirst.mockImplementation(({ where }: { where: { id: string; organizationId: string } }) =>
    Promise.resolve(tasks.find((task) => task.id === where.id && task.organizationId === where.organizationId) ?? null));
  prisma.worklogEntry.findFirst.mockImplementation(({ where }: { where: { id: string; organizationId: string } }) =>
    Promise.resolve(worklogs.find((entry) => entry.id === where.id && entry.organizationId === where.organizationId) ?? null));
});

describe('tenant and team isolation', () => {
  it('usuario de organización A no lee tareas de B', async () => {
    await expect(assertTaskAccess(context('MEMBER', 'member-a'), 'task-b')).rejects.toMatchObject({ status: 404 });
  });

  it('usuario de organización A no lee equipos de B', async () => {
    await expect(assertTeamAccess(context('MEMBER', 'member-a'), 'team-b')).rejects.toMatchObject({ status: 404 });
  });

  it('usuario de organización A no lee worklogs de B', async () => {
    await expect(assertWorklogAccess(context('MEMBER', 'member-a'), 'worklog-b')).rejects.toMatchObject({ status: 404 });
  });

  it('MEMBER no lee borradores de otro miembro', async () => {
    await expect(assertWorklogAccess(context('MEMBER', 'member-a'), 'draft-other')).rejects.toMatchObject({ status: 404 });
  });

  it('TEAM_ADMIN no administra un equipo no asignado', async () => {
    await expect(assertTeamAccess(context('TEAM_ADMIN', 'team-admin'), 'team-a2', 'manage')).rejects.toMatchObject({ status: 404 });
  });

  it('ORG_ADMIN no accede a otra organización', async () => {
    await expect(assertTeamAccess(context('ORG_ADMIN', 'org-admin'), 'team-b', 'manage')).rejects.toMatchObject({ status: 404 });
  });

  it('mantiene accesos legítimos del miembro y del administrador', async () => {
    await expect(assertTaskAccess(context('MEMBER', 'member-a'), 'task-a')).resolves.toMatchObject({ id: 'task-a' });
    await expect(assertWorklogAccess(context('MEMBER', 'member-a'), 'draft-a')).resolves.toMatchObject({ id: 'draft-a' });
    await expect(assertTeamAccess(context('ORG_ADMIN', 'org-admin'), 'team-a', 'manage')).resolves.toMatchObject({ id: 'team-a' });
  });

  it('la visibilidad publicada sigue limitada a equipos autorizados', async () => {
    await expect(assertWorklogAccess(context('VIEWER', 'member-a'), 'published-team-a')).resolves.toMatchObject({ id: 'published-team-a' });
    await expect(assertWorklogAccess(context('VIEWER', 'member-a'), 'published-team-a2')).rejects.toMatchObject({ status: 404 });
  });

  it('canViewWorklog aplica organización, estado y autor', async () => {
    const actor = await getAuthorizedUser(context('MEMBER', 'member-a'));
    expect(canViewWorklog(actor, worklogs[0]!, 'org-a')).toBe(true);
    expect(canViewWorklog(actor, worklogs[1]!, 'org-a')).toBe(false);
    expect(canViewWorklog(actor, worklogs[4]!, 'org-a')).toBe(false);
  });
});
