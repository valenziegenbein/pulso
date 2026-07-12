import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS } from '@pulso/domain';
import { Prisma, prisma } from '@pulso/database';
import type { RoleKey } from '@pulso/shared';
import type { AuthContext } from '@/lib/auth/context';
import {
  assertOrganizationAccess,
  assertTaskAccess,
  assertTeamAccess,
  assertWorklogAccess,
  requireUserInOrg,
} from '@/server/authz';

const ids = {
  orgA: 'it-org-a',
  orgB: 'it-org-b',
  member: 'it-user-global-member',
  other: 'it-user-other-member',
  teamAdmin: 'it-user-team-admin',
  orgAdmin: 'it-user-org-admin',
  memberB: 'it-user-member-b',
  teamA: 'it-team-a',
  teamA2: 'it-team-a2',
  teamB: 'it-team-b',
  taskA: 'it-task-a',
  taskB: 'it-task-b',
  draftOwn: 'it-worklog-draft-own',
  draftOther: 'it-worklog-draft-other',
  publishedA: 'it-worklog-published-a',
  publishedA2: 'it-worklog-published-a2',
  publishedB: 'it-worklog-published-b',
} as const;

const roleId = (org: 'a' | 'b', role: RoleKey) => `it-role-${org}-${role.toLowerCase()}`;

function context(userId: string, organizationId: string, role: RoleKey): AuthContext {
  return {
    user: { id: userId, name: userId, email: `${userId}@integration.invalid` },
    organizationId,
    organizationName: organizationId,
    role,
    permissions: DEFAULT_ROLE_PERMISSIONS[role],
  };
}

const memberInA = context(ids.member, ids.orgA, 'MEMBER');
const viewerInB = context(ids.member, ids.orgB, 'VIEWER');
const teamAdminInA = context(ids.teamAdmin, ids.orgA, 'TEAM_ADMIN');
const orgAdminInA = context(ids.orgAdmin, ids.orgA, 'ORG_ADMIN');

beforeAll(async () => {
  await prisma.organization.createMany({
    data: [
      { id: ids.orgA, name: 'Integración A', slug: 'integration-a' },
      { id: ids.orgB, name: 'Integración B', slug: 'integration-b' },
    ],
  });

  const roles: Array<{ id: string; organizationId: string; key: RoleKey; name: string; permissions: string }> = [];
  for (const [org, organizationId] of [['a', ids.orgA], ['b', ids.orgB]] as const) {
    for (const key of ['ORG_ADMIN', 'TEAM_ADMIN', 'MEMBER', 'VIEWER'] as const) {
      roles.push({
        id: roleId(org, key),
        organizationId,
        key,
        name: `${key} ${org}`,
        permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS[key]),
      });
    }
  }
  await prisma.role.createMany({ data: roles });

  await prisma.user.createMany({
    data: [ids.member, ids.other, ids.teamAdmin, ids.orgAdmin, ids.memberB].map((id) => ({
      id,
      email: `${id}@integration.invalid`,
      name: id,
      passwordHash: 'synthetic-not-a-real-password',
    })),
  });

  await prisma.orgMembership.createMany({
    data: [
      { id: 'it-om-member-a', organizationId: ids.orgA, userId: ids.member, roleId: roleId('a', 'MEMBER') },
      { id: 'it-om-member-b', organizationId: ids.orgB, userId: ids.member, roleId: roleId('b', 'VIEWER') },
      { id: 'it-om-other-a', organizationId: ids.orgA, userId: ids.other, roleId: roleId('a', 'MEMBER') },
      { id: 'it-om-team-admin-a', organizationId: ids.orgA, userId: ids.teamAdmin, roleId: roleId('a', 'TEAM_ADMIN') },
      { id: 'it-om-org-admin-a', organizationId: ids.orgA, userId: ids.orgAdmin, roleId: roleId('a', 'ORG_ADMIN') },
      { id: 'it-om-native-b', organizationId: ids.orgB, userId: ids.memberB, roleId: roleId('b', 'MEMBER') },
    ],
  });

  await prisma.team.createMany({
    data: [
      { id: ids.teamA, organizationId: ids.orgA, name: 'Equipo A' },
      { id: ids.teamA2, organizationId: ids.orgA, name: 'Equipo A no asignado' },
      { id: ids.teamB, organizationId: ids.orgB, name: 'Equipo B' },
    ],
  });
  await prisma.teamMembership.createMany({
    data: [
      { id: 'it-tm-member-a', organizationId: ids.orgA, teamId: ids.teamA, userId: ids.member, roleId: roleId('a', 'MEMBER') },
      { id: 'it-tm-member-b', organizationId: ids.orgB, teamId: ids.teamB, userId: ids.member, roleId: roleId('b', 'VIEWER') },
      { id: 'it-tm-other-a', organizationId: ids.orgA, teamId: ids.teamA, userId: ids.other, roleId: roleId('a', 'MEMBER') },
      { id: 'it-tm-admin-a', organizationId: ids.orgA, teamId: ids.teamA, userId: ids.teamAdmin, roleId: roleId('a', 'TEAM_ADMIN') },
      { id: 'it-tm-native-b', organizationId: ids.orgB, teamId: ids.teamB, userId: ids.memberB, roleId: roleId('b', 'MEMBER') },
    ],
  });

  await prisma.task.createMany({
    data: [
      {
        id: ids.taskA,
        organizationId: ids.orgA,
        teamId: ids.teamA,
        title: 'Tarea sintética A',
        assigneeId: ids.member,
        createdById: ids.orgAdmin,
        status: 'TODO',
      },
      {
        id: ids.taskB,
        organizationId: ids.orgB,
        teamId: ids.teamB,
        title: 'Tarea sintética B',
        assigneeId: ids.memberB,
        createdById: ids.memberB,
        status: 'TODO',
      },
    ],
  });

  await prisma.worklogEntry.createMany({
    data: [
      { id: ids.draftOwn, organizationId: ids.orgA, teamId: ids.teamA, taskId: ids.taskA, authorId: ids.member, type: 'NOTE', status: 'DRAFT', title: 'Borrador propio', content: 'Sintético' },
      { id: ids.draftOther, organizationId: ids.orgA, teamId: ids.teamA, taskId: ids.taskA, authorId: ids.other, type: 'NOTE', status: 'DRAFT', title: 'Borrador ajeno', content: 'Sintético' },
      { id: ids.publishedA, organizationId: ids.orgA, teamId: ids.teamA, taskId: ids.taskA, authorId: ids.other, type: 'PROGRESS', status: 'PUBLISHED', title: 'Publicado A', content: 'Sintético', publishedAt: new Date() },
      { id: ids.publishedA2, organizationId: ids.orgA, teamId: ids.teamA2, authorId: ids.other, type: 'PROGRESS', status: 'PUBLISHED', title: 'Publicado A2', content: 'Sintético', publishedAt: new Date() },
      { id: ids.publishedB, organizationId: ids.orgB, teamId: ids.teamB, taskId: ids.taskB, authorId: ids.memberB, type: 'PROGRESS', status: 'PUBLISHED', title: 'Publicado B', content: 'Sintético', publishedAt: new Date() },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PostgreSQL real: aislamiento multi-tenant', () => {
  it('una identidad global conserva membresías independientes y organización activa explícita', async () => {
    const memberships = await prisma.orgMembership.findMany({
      where: { userId: ids.member },
      orderBy: { organizationId: 'asc' },
      select: { organizationId: true },
    });
    expect(memberships).toEqual([{ organizationId: ids.orgA }, { organizationId: ids.orgB }]);
    await expect(assertTaskAccess(memberInA, ids.taskB)).rejects.toMatchObject({ status: 404 });
    await expect(assertTaskAccess(viewerInB, ids.taskB)).resolves.toMatchObject({ id: ids.taskB });
  });

  it('organización A no lee equipos, tareas ni worklogs de B', async () => {
    expect(() => assertOrganizationAccess(memberInA, ids.orgB)).toThrowError();
    await expect(assertTeamAccess(memberInA, ids.teamB)).rejects.toMatchObject({ status: 404 });
    await expect(assertTaskAccess(memberInA, ids.taskB)).rejects.toMatchObject({ status: 404 });
    await expect(assertWorklogAccess(memberInA, ids.publishedB)).rejects.toMatchObject({ status: 404 });
  });

  it('MEMBER sólo lee su borrador y no el borrador de otro miembro', async () => {
    await expect(assertWorklogAccess(memberInA, ids.draftOwn)).resolves.toMatchObject({ id: ids.draftOwn });
    await expect(assertWorklogAccess(memberInA, ids.draftOther)).rejects.toMatchObject({ status: 404 });
  });

  it('TEAM_ADMIN administra el equipo asignado pero no otro equipo', async () => {
    await expect(assertTeamAccess(teamAdminInA, ids.teamA, 'manage')).resolves.toMatchObject({ id: ids.teamA });
    await expect(assertTeamAccess(teamAdminInA, ids.teamA2, 'manage')).rejects.toMatchObject({ status: 404 });
  });

  it('ORG_ADMIN administra su organización pero no otra', async () => {
    await expect(assertTeamAccess(orgAdminInA, ids.teamA2, 'manage')).resolves.toMatchObject({ id: ids.teamA2 });
    await expect(assertTeamAccess(orgAdminInA, ids.teamB, 'manage')).rejects.toMatchObject({ status: 404 });
  });

  it('una asignación exige membresía real en el equipo', async () => {
    await expect(requireUserInOrg(orgAdminInA, ids.other, ids.teamA)).resolves.toMatchObject({ userId: ids.other });
    await expect(requireUserInOrg(orgAdminInA, ids.member, ids.teamA2)).rejects.toMatchObject({ status: 404 });
  });
});

describe('PostgreSQL real: constraints y relaciones existentes', () => {
  it('aplica uniques de organización, usuario y membresías', async () => {
    await expect(prisma.organization.create({ data: { name: 'Duplicada', slug: 'integration-a' } }))
      .rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.user.create({ data: { email: `${ids.member}@integration.invalid`, name: 'Duplicado', passwordHash: 'x' } }))
      .rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.orgMembership.create({ data: { organizationId: ids.orgA, userId: ids.member, roleId: roleId('a', 'MEMBER') } }))
      .rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.teamMembership.create({ data: { organizationId: ids.orgA, teamId: ids.teamA, userId: ids.member, roleId: roleId('a', 'MEMBER') } }))
      .rejects.toMatchObject({ code: 'P2002' });
  });

  it('aplica foreign keys existentes', async () => {
    await expect(prisma.task.create({
      data: {
        id: 'it-invalid-task',
        organizationId: 'missing-org',
        teamId: ids.teamA,
        title: 'Inválida',
        createdById: ids.member,
      },
    })).rejects.toSatisfy((error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003');
  });

  it('rechaza roles y equipos de otra organización en membresías', async () => {
    await expect(prisma.orgMembership.create({
      data: {
        organizationId: ids.orgA,
        userId: ids.memberB,
        roleId: roleId('b', 'MEMBER'),
      },
    })).rejects.toMatchObject({ code: 'P2003' });

    await expect(prisma.teamMembership.create({
      data: {
        organizationId: ids.orgA,
        teamId: ids.teamB,
        userId: ids.other,
        roleId: roleId('a', 'MEMBER'),
      },
    })).rejects.toMatchObject({ code: 'P2003' });

    await expect(prisma.teamMembership.create({
      data: {
        organizationId: ids.orgA,
        teamId: ids.teamA,
        userId: ids.memberB,
        roleId: roleId('a', 'MEMBER'),
      },
    })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rechaza recursos que mezclan organización y equipo', async () => {
    await expect(prisma.task.create({
      data: {
        id: 'it-cross-tenant-task',
        organizationId: ids.orgA,
        teamId: ids.teamB,
        title: 'Cross tenant',
        createdById: ids.orgAdmin,
      },
    })).rejects.toMatchObject({ code: 'P2003' });

    await expect(prisma.decisionRequest.create({
      data: {
        id: 'it-cross-tenant-decision',
        organizationId: ids.orgA,
        teamId: ids.teamB,
        requestedById: ids.orgAdmin,
        title: 'Cross tenant',
        context: 'Sintético',
      },
    })).rejects.toMatchObject({ code: 'P2003' });

    await expect(prisma.attachment.create({
      data: {
        id: 'it-cross-tenant-attachment',
        organizationId: ids.orgA,
        uploadedById: ids.orgAdmin,
        kind: 'LINK',
        url: 'https://integration.invalid/evidence',
        taskId: ids.taskB,
      },
    })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('serializa la carrera de alta de una membresía organizacional', async () => {
    const userId = 'it-user-concurrent-membership';
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@integration.invalid`,
        name: 'Concurrente',
        passwordHash: 'synthetic-not-a-real-password',
      },
    });

    const attempts = await Promise.allSettled([
      prisma.orgMembership.create({
        data: { organizationId: ids.orgA, userId, roleId: roleId('a', 'MEMBER') },
      }),
      prisma.orgMembership.create({
        data: { organizationId: ids.orgA, userId, roleId: roleId('a', 'MEMBER') },
      }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    await expect(prisma.orgMembership.count({ where: { organizationId: ids.orgA, userId } })).resolves.toBe(1);
  });

  it('conserva cascadas existentes al eliminar una organización', async () => {
    const organizationId = 'it-org-cascade';
    const teamId = 'it-team-cascade';
    const taskId = 'it-task-cascade';
    const worklogId = 'it-worklog-cascade';
    await prisma.organization.create({ data: { id: organizationId, name: 'Cascade', slug: 'integration-cascade' } });
    await prisma.team.create({ data: { id: teamId, organizationId, name: 'Cascade' } });
    await prisma.task.create({ data: { id: taskId, organizationId, teamId, title: 'Cascade', createdById: ids.member } });
    await prisma.worklogEntry.create({ data: { id: worklogId, organizationId, teamId, taskId, authorId: ids.member, type: 'NOTE', title: 'Cascade', content: 'Sintético' } });

    await prisma.organization.delete({ where: { id: organizationId } });
    await expect(prisma.team.findUnique({ where: { id: teamId } })).resolves.toBeNull();
    await expect(prisma.task.findUnique({ where: { id: taskId } })).resolves.toBeNull();
    await expect(prisma.worklogEntry.findUnique({ where: { id: worklogId } })).resolves.toBeNull();
  });
});
