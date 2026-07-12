import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, prisma } from '@pulso/database';
import { acceptOrganizationInvite, createOrganizationInvite, MockAuthNotificationProvider } from '@/server/auth-service';
import {
  getEntitlements,
  recordAIUsage,
  removeOrganizationMember,
  setMembershipStatus,
  transferOrganizationOwnership,
} from '@/server/entitlements';

const orgId = 'ent-org';
const roleAdmin = 'ent-role-admin';
const roleMember = 'ent-role-member';
const owner = 'ent-owner';
const member = 'ent-member';
const candidates = ['ent-candidate-a', 'ent-candidate-b'];

beforeAll(async () => {
  await prisma.planDefinition.create({
    data: { key: 'TEST_P3', name: 'Synthetic P3', defaultSeatLimit: 3, managedAiIncludedUnits: 100 },
  });
  await prisma.organization.create({ data: { id: orgId, name: 'Entitlements', slug: 'entitlements-integration', planKey: 'FREE', seatLimit: 3 } });
  await prisma.organizationSubscription.create({ data: { organizationId: orgId, planKey: 'TEST_P3', provider: 'MOCK' } });
  await prisma.role.createMany({ data: [
    { id: roleAdmin, organizationId: orgId, key: 'ORG_ADMIN', name: 'Admin', permissions: '[]' },
    { id: roleMember, organizationId: orgId, key: 'MEMBER', name: 'Member', permissions: '[]' },
  ] });
  await prisma.user.createMany({ data: [owner, member, ...candidates].map((id) => ({
    id, email: `${id}@integration.invalid`, normalizedEmail: `${id}@integration.invalid`, name: id,
    passwordHash: hashPassword('synthetic-password'), emailVerifiedAt: new Date(),
  })) });
  await prisma.orgMembership.createMany({ data: [
    { organizationId: orgId, userId: owner, roleId: roleAdmin, isOwner: true },
    { organizationId: orgId, userId: member, roleId: roleMember },
  ] });
});

afterAll(async () => prisma.$disconnect());

describe('PostgreSQL real: seats transaccionales', () => {
  it('pending invites do not consume a seat and only one concurrent acceptance wins', async () => {
    const providers = [new MockAuthNotificationProvider(), new MockAuthNotificationProvider()];
    for (let index = 0; index < candidates.length; index += 1) {
      await createOrganizationInvite({
        organizationId: orgId, invitedById: owner,
        email: `${candidates[index]}@integration.invalid`, roleId: roleMember,
      }, providers[index]);
    }
    await expect(getEntitlements(orgId)).resolves.toMatchObject({ usedSeats: 2, seatLimit: 3, seatsAvailable: 1 });
    const attempts = await Promise.allSettled(candidates.map((userId, index) =>
      acceptOrganizationInvite(providers[index].deliveries[0]!.token, userId)));
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled' && attempt.value)).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    await expect(getEntitlements(orgId)).resolves.toMatchObject({ usedSeats: 3, seatsAvailable: 0 });
  });

  it('suspension keeps a seat while deletion releases it', async () => {
    await setMembershipStatus(orgId, member, 'SUSPENDED');
    await expect(getEntitlements(orgId)).resolves.toMatchObject({ usedSeats: 3 });
    await removeOrganizationMember(orgId, member);
    await expect(getEntitlements(orgId)).resolves.toMatchObject({ usedSeats: 2, seatsAvailable: 1 });
  });
});

describe('PostgreSQL real: ownership', () => {
  it('protects the last owner and supports explicit transfer', async () => {
    await expect(removeOrganizationMember(orgId, owner)).rejects.toThrow('último owner');
    const target = await prisma.orgMembership.findFirstOrThrow({ where: { organizationId: orgId, userId: { in: candidates } } });
    await transferOrganizationOwnership(orgId, owner, target.userId);
    await expect(removeOrganizationMember(orgId, owner)).resolves.toBeUndefined();
    await expect(prisma.orgMembership.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId: target.userId } } })).resolves.toMatchObject({ isOwner: true });
  });
});

describe('PostgreSQL real: Managed AI ledger', () => {
  it('is idempotent, enforces quota and never charges BYOK', async () => {
    const first = await recordAIUsage({ organizationId: orgId, providerType: 'OPENAI', model: 'synthetic', operation: 'suggest', inputTokens: 40, outputTokens: 20, managed: true, idempotencyKey: 'ent-ai-1' });
    const replay = await recordAIUsage({ organizationId: orgId, providerType: 'OPENAI', model: 'synthetic', operation: 'suggest', inputTokens: 40, outputTokens: 20, managed: true, idempotencyKey: 'ent-ai-1' });
    expect(replay.id).toBe(first.id);
    await expect(recordAIUsage({ organizationId: orgId, providerType: 'OPENAI', model: 'synthetic', operation: 'suggest', inputTokens: 30, outputTokens: 20, managed: true, idempotencyKey: 'ent-ai-2' })).rejects.toThrow('Cuota Managed AI');
    await recordAIUsage({ organizationId: orgId, providerType: 'OPENAI_COMPATIBLE', model: 'byok', operation: 'suggest', inputTokens: 1000, outputTokens: 1000, managed: false, idempotencyKey: 'ent-ai-byok' });
    await expect(prisma.usageLedger.count({ where: { organizationId: orgId } })).resolves.toBe(1);
  });
});
