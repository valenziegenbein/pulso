import { Prisma, prisma } from '@pulso/database';
import type { AuthContext } from '@/lib/auth/context';
import { AuthorizationError } from '@/server/authz';
import type { BillingProvider, VerifiedBillingEvent } from './provider';
import { quoteLaunchOffer, type CommercialOfferId, type PriceVersion } from './catalog';

export async function canManageBilling(ctx: AuthContext): Promise<boolean> {
  const membership = await prisma.orgMembership.findUnique({
    where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.user.id } },
    select: { isOwner: true, status: true },
  });
  return membership?.isOwner === true && membership.status === 'ACTIVE';
}

export async function assertCanManageBilling(ctx: AuthContext): Promise<void> {
  if (!await canManageBilling(ctx)) throw new AuthorizationError();
}

export async function getBillingOverview(ctx: AuthContext) {
  await assertCanManageBilling(ctx);
  return prisma.organizationSubscription.findUnique({
    where: { organizationId: ctx.organizationId },
    include: { plan: true },
  });
}

export async function createMockCheckout(
  ctx: AuthContext,
  provider: BillingProvider,
  planKey: 'FREE' | 'TEAM' | 'BUSINESS' | 'ENTERPRISE',
) {
  await assertCanManageBilling(ctx);
  const customer = await provider.createCustomer({ organizationId: ctx.organizationId, email: ctx.user.email });
  return provider.createCheckoutSession({ organizationId: ctx.organizationId, customerId: customer.customerId, planKey });
}

export async function createMercadoPagoMockCheckout(
  ctx: AuthContext,
  provider: BillingProvider,
  offerId: CommercialOfferId,
  priceVersion: PriceVersion,
) {
  await assertCanManageBilling(ctx);
  const quote = quoteLaunchOffer(offerId, priceVersion);
  const customer = await provider.createCustomer({ organizationId: ctx.organizationId, email: ctx.user.email });
  const session = await provider.createCheckoutSession({
    organizationId: ctx.organizationId,
    customerId: customer.customerId,
    planKey: quote.planKey,
  });
  return { session, quote };
}

export async function processBillingWebhook(provider: BillingProvider, rawBody: string, signature: string) {
  const event = await provider.handleWebhook(rawBody, signature);
  const receipt = await receiveOnce(event);
  if (!receipt.created) return { duplicate: true, eventId: receipt.id };
  try {
    await applyVerifiedEvent(event, receipt.id);
    return { duplicate: false, eventId: receipt.id };
  } catch (error) {
    await prisma.billingWebhookEvent.update({
      where: { id: receipt.id },
      data: { status: 'FAILED', attempts: { increment: 1 }, lastError: sanitizeError(error) },
    });
    throw error;
  }
}

async function receiveOnce(event: VerifiedBillingEvent): Promise<{ created: boolean; id: string }> {
  try {
    const row = await prisma.billingWebhookEvent.create({
      data: {
        organizationId: event.subscription.organizationId,
        provider: event.provider,
        externalEventId: event.externalEventId,
        type: event.type,
        payloadHash: event.payloadHash,
      },
      select: { id: true },
    });
    return { created: true, id: row.id };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const existing = await prisma.billingWebhookEvent.findUniqueOrThrow({
      where: { provider_externalEventId: { provider: event.provider, externalEventId: event.externalEventId } },
      select: { id: true, payloadHash: true },
    });
    if (existing.payloadHash !== event.payloadHash) throw new Error('El ID de webhook fue reutilizado con otro payload.');
    return { created: false, id: existing.id };
  }
}

async function applyVerifiedEvent(event: VerifiedBillingEvent, eventId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({ where: { id: event.subscription.organizationId } });
    const plan = await tx.planDefinition.findUnique({ where: { key: event.subscription.planKey } });
    if (!organization || !plan) throw new Error('Organización o plan de billing desconocido.');
    await tx.organizationSubscription.upsert({
      where: { organizationId: organization.id },
      create: {
        organizationId: organization.id, planKey: plan.key, provider: event.provider,
        status: event.subscription.status, providerCustomerId: event.subscription.customerId,
        providerSubscriptionId: event.subscription.subscriptionId,
        currentPeriodStart: event.subscription.currentPeriodStart, currentPeriodEnd: event.subscription.currentPeriodEnd,
        cancelAtPeriodEnd: event.subscription.cancelAtPeriodEnd, trialEndsAt: event.subscription.trialEndsAt,
      },
      update: {
        planKey: plan.key, provider: event.provider, status: event.subscription.status,
        providerCustomerId: event.subscription.customerId, providerSubscriptionId: event.subscription.subscriptionId,
        currentPeriodStart: event.subscription.currentPeriodStart, currentPeriodEnd: event.subscription.currentPeriodEnd,
        cancelAtPeriodEnd: event.subscription.cancelAtPeriodEnd, trialEndsAt: event.subscription.trialEndsAt,
      },
    });
    await tx.organization.update({
      where: { id: organization.id },
      data: { planKey: plan.key, ...(plan.customizableSeats ? {} : { seatLimit: plan.defaultSeatLimit }) },
    });
    await tx.billingWebhookEvent.update({
      where: { id: eventId },
      data: { status: 'PROCESSED', attempts: { increment: 1 }, processedAt: new Date(), lastError: null },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Error de billing';
  return message.replace(/[\r\n\t]/g, ' ').slice(0, 240);
}
