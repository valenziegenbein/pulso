import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, prisma } from '@pulso/database';
import type { AuthContext } from '@/lib/auth/context';
import { MercadoPagoMockBillingProvider, MockBillingProvider } from '@/server/billing/provider';
import { createMercadoPagoMockCheckout, createMockCheckout, getBillingOverview, processBillingWebhook } from '@/server/billing/service';

const orgId = 'billing-org';
const ownerId = 'billing-owner';
const memberId = 'billing-member';
const replacementOrgId = 'billing-replacement-org';
const replacementOwnerId = 'billing-replacement-owner';
const secret = 'synthetic-billing-webhook-secret';

function context(userId: string, role: AuthContext['role'], organizationId = orgId): AuthContext {
  return { user: { id: userId, name: userId, email: `${userId}@integration.invalid` }, organizationId, organizationName: 'Billing synthetic', role, permissions: [] };
}

function eventBody(id: string, checkoutReference: string, subscriptionId: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id, type: 'SUBSCRIPTION_UPDATED',
    subscription: {
      checkoutReference, status: 'ACTIVE', currency: 'ARS', amountCentavos: 100,
      customerId: 'mock-customer', subscriptionId,
      currentPeriodStart: '2026-07-01T00:00:00.000Z', currentPeriodEnd: '2026-08-01T00:00:00.000Z',
      cancelAtPeriodEnd: false, trialEndsAt: null, ...overrides,
    },
  });
}

beforeAll(async () => {
  await prisma.organization.createMany({ data: [
    { id: orgId, name: 'Billing synthetic', slug: 'billing-synthetic', planKey: 'FREE', seatLimit: 5 },
    { id: replacementOrgId, name: 'Billing replacement', slug: 'billing-replacement', planKey: 'FREE', seatLimit: 5 },
  ] });
  await prisma.organizationSubscription.createMany({ data: [
    { organizationId: orgId, planKey: 'FREE', provider: 'MOCK' },
    { organizationId: replacementOrgId, planKey: 'FREE', provider: 'MOCK' },
  ] });
  await prisma.role.createMany({ data: [
    { id: 'billing-role-owner', organizationId: orgId, key: 'ORG_ADMIN', name: 'Owner', permissions: '[]' },
    { id: 'billing-role-member', organizationId: orgId, key: 'MEMBER', name: 'Member', permissions: '[]' },
    { id: 'billing-role-replacement-owner', organizationId: replacementOrgId, key: 'ORG_ADMIN', name: 'Owner', permissions: '[]' },
  ] });
  await prisma.user.createMany({ data: [ownerId, memberId, replacementOwnerId].map((id) => ({
    id, email: `${id}@integration.invalid`, normalizedEmail: `${id}@integration.invalid`, name: id,
    passwordHash: hashPassword('synthetic-password'), emailVerifiedAt: new Date(),
  })) });
  await prisma.orgMembership.createMany({ data: [
    { organizationId: orgId, userId: ownerId, roleId: 'billing-role-owner', isOwner: true },
    { organizationId: orgId, userId: memberId, roleId: 'billing-role-member' },
    { organizationId: replacementOrgId, userId: replacementOwnerId, roleId: 'billing-role-replacement-owner', isOwner: true },
  ] });
});

afterAll(async () => prisma.$disconnect());

describe('PostgreSQL real: billing control plane', () => {
  it('sólo permite al owner consultar billing y crear checkout mock', async () => {
    const provider = new MockBillingProvider(secret);
    await expect(getBillingOverview(context(memberId, 'MEMBER'))).rejects.toThrow('Recurso no encontrado');
    await expect(createMockCheckout(context(memberId, 'MEMBER'), provider, 'TEAM')).rejects.toThrow('Recurso no encontrado');
    await expect(createMockCheckout(context(ownerId, 'ORG_ADMIN'), provider, 'TEAM')).resolves.toMatchObject({ provider: 'MOCK', url: null });
    const mercadoPago = new MercadoPagoMockBillingProvider(secret);
    const checkout = await createMercadoPagoMockCheckout(context(ownerId, 'ORG_ADMIN'), mercadoPago, 'teams-5', {
      id: 'ars-integration', arsCentavosPerUsd: 100_000, validUntil: new Date(Date.now() + 60_000),
    });
    expect(checkout).toMatchObject({
      session: { provider: 'MERCADO_PAGO_MOCK', url: null },
      quote: { offerId: 'teams-5', discountBps: 2_500, seats: 5, currency: 'ARS' },
    });
    await expect(prisma.billingCheckoutAttempt.findUnique({ where: { id: checkout.checkoutAttemptId } })).resolves.toMatchObject({
      organizationId: orgId, createdById: ownerId, provider: 'MERCADO_PAGO_MOCK', offerId: 'teams-5',
      priceVersionId: 'ars-integration', planKey: 'TEAM', seats: 5, currency: 'ARS',
      listAmountCentavos: 4_900_000, chargedAmountCentavos: 3_675_000, discountBps: 2_500, discountMonths: 12,
      status: 'PENDING',
    });
  });

  it('rechaza firma inválida y procesa el webhook válido exactamente una vez', async () => {
    const provider = new MockBillingProvider(secret);
    const session = await createMockCheckout(context(ownerId, 'ORG_ADMIN'), provider, 'TEAM');
    const attempt = await prisma.billingCheckoutAttempt.findFirstOrThrow({
      where: { organizationId: orgId, provider: 'MOCK', status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    const raw = eventBody('billing-event-1', attempt.id, session.reference);
    const input = (signature: string, body = raw) => ({ rawBody: body, signature, requestId: 'billing-request-1', dataId: session.reference });
    await expect(processBillingWebhook(provider, input('sha256=invalid'))).rejects.toThrow('Firma');
    expect(await prisma.billingWebhookEvent.count({ where: { organizationId: orgId } })).toBe(0);
    await expect(processBillingWebhook(provider, input(provider.sign(raw)))).resolves.toMatchObject({ duplicate: false });
    await expect(processBillingWebhook(provider, input(provider.sign(raw)))).resolves.toMatchObject({ duplicate: true });
    await expect(prisma.billingWebhookEvent.findUnique({ where: { provider_externalEventId: { provider: 'MOCK', externalEventId: 'billing-event-1' } } }))
      .resolves.toMatchObject({ status: 'PROCESSED', attempts: 1 });
    await expect(prisma.organizationSubscription.findUnique({ where: { organizationId: orgId } }))
      .resolves.toMatchObject({ planKey: 'TEAM', status: 'ACTIVE', providerSubscriptionId: session.reference });
    await expect(prisma.organization.findUnique({ where: { id: orgId } })).resolves.toMatchObject({ planKey: 'TEAM', seatLimit: 1 });
  });

  it('rechaza reutilizar un ID de evento con contenido diferente', async () => {
    const provider = new MockBillingProvider(secret);
    const attempt = await prisma.billingCheckoutAttempt.findFirstOrThrow({ where: { organizationId: orgId, provider: 'MOCK', status: 'ACTIVE' } });
    const changed = eventBody('billing-event-1', attempt.id, attempt.providerSubscriptionId!, { cancelAtPeriodEnd: true });
    await expect(processBillingWebhook(provider, {
      rawBody: changed, signature: provider.sign(changed), requestId: 'billing-request-1', dataId: attempt.providerSubscriptionId!,
    })).rejects.toThrow('reutilizado');
  });

  it('permite reemplazar sólo un checkout pendiente que fue supersedido', async () => {
    const provider = new MockBillingProvider(secret);
    const owner = context(replacementOwnerId, 'ORG_ADMIN', replacementOrgId);
    const oldSession = await createMockCheckout(owner, provider, 'TEAM');
    const oldAttempt = await prisma.billingCheckoutAttempt.findFirstOrThrow({
      where: { organizationId: replacementOrgId, status: 'PENDING' }, orderBy: { createdAt: 'desc' },
    });
    const oldPending = eventBody('billing-replacement-old', oldAttempt.id, oldSession.reference, { status: 'PENDING' });
    await processBillingWebhook(provider, {
      rawBody: oldPending, signature: provider.sign(oldPending), requestId: 'replacement-old', dataId: oldSession.reference,
    });

    const newSession = await createMockCheckout(owner, provider, 'TEAM');
    const newAttempt = await prisma.billingCheckoutAttempt.findFirstOrThrow({
      where: { organizationId: replacementOrgId, status: 'PENDING' }, orderBy: { createdAt: 'desc' },
    });
    const newActive = eventBody('billing-replacement-new', newAttempt.id, newSession.reference);
    await expect(processBillingWebhook(provider, {
      rawBody: newActive, signature: provider.sign(newActive), requestId: 'replacement-new', dataId: newSession.reference,
    })).resolves.toMatchObject({ duplicate: false });
    await expect(prisma.billingCheckoutAttempt.findUnique({ where: { id: oldAttempt.id } })).resolves.toMatchObject({ status: 'EXPIRED' });
    await expect(prisma.organizationSubscription.findUnique({ where: { organizationId: replacementOrgId } }))
      .resolves.toMatchObject({ status: 'ACTIVE', providerSubscriptionId: newSession.reference });
  });
});
