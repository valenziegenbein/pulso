import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS } from '@pulso/domain';
import { prisma } from '@pulso/database';
import type { AuthContext } from '@/lib/auth/context';
import { assertTaskAccess, assertTeamAccess, assertWorklogAccess } from '@/server/authz';

const member: AuthContext = {
  user: { id: 'upgrade-member', name: 'Miembro sintético', email: 'upgrade-member@integration.invalid' },
  organizationId: 'upgrade-org',
  organizationName: 'Organización sintética de upgrade',
  role: 'MEMBER',
  permissions: DEFAULT_ROLE_PERMISSIONS.MEMBER,
};

afterAll(async () => {
  await prisma.$disconnect();
});

describe('upgrade sintético equivalente a producción', () => {
  it('preserva conteos y aplica defaults de las migraciones posteriores', async () => {
    const [organization, users, memberships, teamMembership, teams, tasks, worklogs] = await Promise.all([
      prisma.organization.findUnique({ where: { id: 'upgrade-org' } }),
      prisma.user.count(),
      prisma.orgMembership.count(),
      prisma.teamMembership.findUnique({
        where: { teamId_userId: { teamId: 'upgrade-team', userId: 'upgrade-member' } },
      }),
      prisma.team.count(),
      prisma.task.count(),
      prisma.worklogEntry.count(),
    ]);
    expect(organization).toMatchObject({ planKey: 'FREE', seatLimit: 5 });
    expect(teamMembership).toMatchObject({ organizationId: 'upgrade-org' });
    await expect(prisma.user.findUnique({ where: { id: 'upgrade-member' } })).resolves.toMatchObject({
      normalizedEmail: 'upgrade-member@integration.invalid',
      status: 'ACTIVE',
      securityVersion: 1,
    });
    await expect(prisma.organizationSubscription.findUnique({ where: { organizationId: 'upgrade-org' } })).resolves.toMatchObject({ planKey: 'FREE', provider: 'MOCK' });
    await expect(prisma.orgMembership.findUnique({ where: { organizationId_userId: { organizationId: 'upgrade-org', userId: 'upgrade-admin' } } })).resolves.toMatchObject({ isOwner: true });
    expect({ users, memberships, teams, tasks, worklogs }).toEqual({
      users: 2,
      memberships: 2,
      teams: 1,
      tasks: 1,
      worklogs: 2,
    });
  });

  it('preserva relaciones y aislamiento funcional después del upgrade', async () => {
    const task = await prisma.task.findUnique({
      where: { id: 'upgrade-task' },
      include: { organization: true, team: true, assignee: true, worklogEntries: true },
    });
    expect(task).toMatchObject({
      organizationId: 'upgrade-org',
      teamId: 'upgrade-team',
      assigneeId: 'upgrade-member',
    });
    expect(task?.worklogEntries).toHaveLength(2);
    await expect(assertTeamAccess(member, 'upgrade-team')).resolves.toMatchObject({ id: 'upgrade-team' });
    await expect(assertTaskAccess(member, 'upgrade-task')).resolves.toMatchObject({ id: 'upgrade-task' });
    await expect(assertWorklogAccess(member, 'upgrade-draft')).resolves.toMatchObject({ id: 'upgrade-draft' });
  });

  it('registra todas las migraciones actuales como exitosas', async () => {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY migration_name
    `;
    expect(rows.map((row) => row.migration_name)).toEqual([
      '20260624213924_init',
      '20260625010000_org_plans',
      '20260712030000_tenant_relational_integrity',
      '20260712050000_persisted_auth',
      '20260712070000_entitlements',
    ]);
  });
});
