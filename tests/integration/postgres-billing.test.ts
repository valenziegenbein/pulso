import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, prisma } from '@pulso/database';
import type { AuthContext } from '@/lib/auth/context';
import { MercadoPagoMockBillingProvider, MockBillingProvider } from '@/server/billing/provider';
import { createMercadoPagoMockCheckout, createMockCheckout, getBillingOverview, processBillingWebhook } from '@/server/billing/service';

const orgId = 'billing-org';
const ownerId = 'billing-owner';
const memberId = 'billing-member';
const secret = 'synthetic-billing-webhook-secret';

function context(userId: string, role: AuthContext['role']): AuthContext {
  return { user: { id: userId, name: userId, email: `${userId}@integration.invalid` }, organizationId: orgId, organizationName: 'Billing synthetic', role, permissions: [] };
}

function eventBody(id: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id, type: 'SUBSCRIPTION_UPDATED',
    subscription: {
      organizationId: orgId, planKey: 'TEAM', status: 'ACTIVE',
      customerId: 'mock-customer', subscriptionId: 'mock-subscription',
      currentPeriodStart: '2026-07-01T00:00:00.000Z', currentPeriodEnd: '2026-08-01T00:00:00.000Z',
      cancelAtPeriodEnd: false, trialEndsAt: null, ...overrides,
    },
  });
}

beforeAll(async () => {
  await prisma.organization.create({ data: { id: orgId, name: 'Billing synthetic', slug: 'billing-synthetic', planKey: 'FREE', seatLimit: 5 } });
  await prisma.organizationSubscription.create({ data: { organizationId: orgId, planKey: 'FREE', provider: 'MOCK' } });
  await prisma.role.createMany({ data: [
    { id: 'billing-role-owner', organizationId: orgId, key: 'ORG_ADMIN', name: 'Owner', permissions: '[]' },
    { id: 'billing-role-member', organizationId: orgId, key: 'MEMBER', name: 'Member', permissions: '[]' },
  ] });
  await prisma.user.createMany({ data: [ownerId, memberId].map((id) => ({
    id, email: `${id}@integration.invalid`, normalizedEmail: `${id}@integration.invalid`, name: id,
    passwordHash: hashPassword('synthetic-password'), emailVerifiedAt: new Date(),
  })) });
  await prisma.orgMembership.createMany({ data: [
    { organizationId: orgId, userId: ownerId, roleId: 'billing-role-owner', isOwner: true },
    { organizationId: orgId, userId: memberId, roleId: 'billing-role-member' },
  ] });
});

afterAll(async () => prisma.$disconnect());

describe('PostgreSQL real: billing control plane', () => {
  it('sólo permite al owner consultar billing y crear checkout mock', async () => {
    const provider = new MockBillingProvider(secret);
    await expect(getBillingOverview(context(memberId, 'MEMBER'))).rejects.toThrow('Recurso no encontrado');
    await expect(createMockCheckout(context(ownerId, 'ORG_ADMIN'), provider, 'TEAM')).resolves.toMatchObject({ provider: 'MOCK', url: null });
    const mercadoPago = new MercadoPagoMockBillingProvider(secret);
    await expect(createMercadoPagoMockCheckout(context(ownerId, 'ORG_ADMIN'), mercadoPago, 'teams-5', {
      id: 'ars-integration', arsCentavosPerUsd: 100_000, validUntil: new Date(Date.now() + 60_000),
    })).resolves.toMatchObject({
      session: { provider: 'MERCADO_PAGO_MOCK', url: null },
      quote: { offerId: 'teams-5', discountBps: 2_500, seats: 5, currency: 'ARS' },
    });
  });

  it('rechaza firma inválida y procesa el webhook válido exactamente una vez', async () => {
    const provider = new MockBillingProvider(secret);
    const raw = eventBody('billing-event-1');
    await expect(processBillingWebhook(provider, raw, 'sha256=invalid')).rejects.toThrow('Firma');
    expect(await prisma.billingWebhookEvent.count({ where: { organizationId: orgId } })).toBe(0);
    await expect(processBillingWebhook(provider, raw, provider.sign(raw))).resolves.toMatchObject({ duplicate: false });
    await expect(processBillingWebhook(provider, raw, provider.sign(raw))).resolves.toMatchObject({ duplicate: true });
    await expect(prisma.billingWebhookEvent.findUnique({ where: { provider_externalEventId: { provider: 'MOCK', externalEventId: 'billing-event-1' } } }))
      .resolves.toMatchObject({ status: 'PROCESSED', attempts: 1 });
    await expect(prisma.organizationSubscription.findUnique({ where: { organizationId: orgId } }))
      .resolves.toMatchObject({ planKey: 'TEAM', status: 'ACTIVE', providerSubscriptionId: 'mock-subscription' });
    await expect(prisma.organization.findUnique({ where: { id: orgId } })).resolves.toMatchObject({ planKey: 'TEAM', seatLimit: 15 });
  });

  it('rechaza reutilizar un ID de evento con contenido diferente', async () => {
    const provider = new MockBillingProvider(secret);
    const changed = eventBody('billing-event-1', { cancelAtPeriodEnd: true });
    await expect(processBillingWebhook(provider, changed, provider.sign(changed))).rejects.toThrow('reutilizado');
  });
});
