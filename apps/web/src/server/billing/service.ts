import { Prisma, prisma } from '@pulso/database';
import type { PlanKey } from '@pulso/shared';
import type { AuthContext } from '@/lib/auth/context';
import { AuthorizationError } from '@/server/authz';
import type {
  BillingPriceSnapshot,
  BillingProvider,
  BillingWebhookInput,
  VerifiedBillingEvent,
} from './provider';
import { quoteLaunchOffer, type CommercialOfferId, type PriceVersion } from './catalog';

const CHECKOUT_TTL_MS = 30 * 60_000;
const MUTATING_ATTEMPT_STATUSES = ['CREATED', 'PENDING'] as const;

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
  planKey: PlanKey,
) {
  const result = await createPersistedCheckout(ctx, provider, planKey, {
    offerId: `mock-${planKey.toLowerCase()}`,
    priceVersionId: 'mock-v1',
    currency: 'ARS',
    listAmountCentavos: 100,
    chargedAmountCentavos: 100,
    discountBps: 0,
    discountMonths: 0,
    seats: 1,
  }, 'https://pulso.integration.invalid/billing');
  return result.session;
}

export async function createMercadoPagoMockCheckout(
  ctx: AuthContext,
  provider: BillingProvider,
  offerId: CommercialOfferId,
  priceVersion: PriceVersion,
) {
  return createMercadoPagoCheckout(ctx, provider, offerId, priceVersion, 'https://pulso.integration.invalid');
}

export async function createMercadoPagoCheckout(
  ctx: AuthContext,
  provider: BillingProvider,
  offerId: CommercialOfferId,
  priceVersion: PriceVersion,
  appUrl: string,
) {
  const quote = quoteLaunchOffer(offerId, priceVersion);
  const price: BillingPriceSnapshot = {
    offerId: quote.offerId,
    priceVersionId: quote.priceVersionId,
    currency: quote.currency,
    listAmountCentavos: quote.listArsCentavos,
    chargedAmountCentavos: quote.launchArsCentavos,
    discountBps: quote.discountBps,
    discountMonths: quote.discountMonths,
    seats: quote.seats,
  };
  const backUrl = new URL('/billing?checkout=return', assertAppOrigin(appUrl)).toString();
  const result = await createPersistedCheckout(ctx, provider, quote.planKey, price, backUrl);
  return { ...result, quote };
}

async function createPersistedCheckout(
  ctx: AuthContext,
  provider: BillingProvider,
  planKey: PlanKey,
  price: BillingPriceSnapshot,
  backUrl: string,
) {
  await assertCanManageBilling(ctx);
  const attempt = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ctx.organizationId}, 0))`;
    const subscription = await tx.organizationSubscription.findUnique({ where: { organizationId: ctx.organizationId } });
    if (subscription?.providerSubscriptionId && ['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED'].includes(subscription.status)) {
      throw new Error('La organización ya tiene una suscripción administrada.');
    }
    await tx.billingCheckoutAttempt.updateMany({
      where: { organizationId: ctx.organizationId, status: { in: [...MUTATING_ATTEMPT_STATUSES] } },
      data: { status: 'EXPIRED' },
    });
    return tx.billingCheckoutAttempt.create({
      data: {
        organizationId: ctx.organizationId,
        createdById: ctx.user.id,
        provider: provider.name,
        offerId: price.offerId,
        priceVersionId: price.priceVersionId,
        planKey,
        seats: price.seats,
        currency: price.currency,
        listAmountCentavos: price.listAmountCentavos,
        chargedAmountCentavos: price.chargedAmountCentavos,
        discountBps: price.discountBps,
        discountMonths: price.discountMonths,
        expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  try {
    const customer = await provider.createCustomer({ organizationId: ctx.organizationId, email: ctx.user.email });
    const session = await provider.createCheckoutSession({
      organizationId: ctx.organizationId,
      customerId: customer.customerId,
      customerEmail: ctx.user.email,
      planKey,
      checkoutReference: attempt.id,
      price,
      backUrl,
    });
    await prisma.billingCheckoutAttempt.update({
      where: { id: attempt.id },
      data: { providerCheckoutId: session.reference, status: 'PENDING' },
    });
    return { session, checkoutAttemptId: attempt.id };
  } catch (error) {
    await prisma.billingCheckoutAttempt.update({ where: { id: attempt.id }, data: { status: 'FAILED' } }).catch(() => undefined);
    throw error;
  }
}

export async function processBillingWebhook(provider: BillingProvider, input: BillingWebhookInput) {
  const event = await provider.handleWebhook(input);
  const attempt = await resolveCheckoutAttempt(event);
  const receipt = await receiveOnce(event, attempt.organizationId);
  if (!receipt.created) return { duplicate: true, eventId: receipt.id };
  try {
    await applyVerifiedEvent(event, receipt.id, attempt);
    return { duplicate: false, eventId: receipt.id };
  } catch (error) {
    await prisma.billingWebhookEvent.update({
      where: { id: receipt.id },
      data: { status: 'FAILED', attempts: { increment: 1 }, lastError: sanitizeError(error) },
    });
    throw error;
  }
}

async function resolveCheckoutAttempt(event: VerifiedBillingEvent) {
  const attempt = await prisma.billingCheckoutAttempt.findUnique({ where: { id: event.subscription.checkoutReference } });
  if (!attempt || attempt.provider !== event.provider) throw new Error('Checkout de billing desconocido.');
  if (attempt.currency !== event.subscription.currency || attempt.chargedAmountCentavos !== event.subscription.amountCentavos) {
    throw new Error('El monto o la moneda del proveedor no coincide con el checkout aprobado.');
  }
  if (attempt.providerCheckoutId && attempt.providerCheckoutId !== event.subscription.subscriptionId) {
    throw new Error('La suscripción no coincide con el checkout aprobado.');
  }
  if (['FAILED', 'EXPIRED'].includes(attempt.status) && event.subscription.status !== 'CANCELED') {
    throw new Error('El checkout ya no está vigente.');
  }
  return attempt;
}

async function receiveOnce(event: VerifiedBillingEvent, organizationId: string): Promise<{ created: boolean; id: string }> {
  try {
    const row = await prisma.billingWebhookEvent.create({
      data: {
        organizationId,
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

async function applyVerifiedEvent(
  event: VerifiedBillingEvent,
  eventId: string,
  attempt: Awaited<ReturnType<typeof resolveCheckoutAttempt>>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const [organization, plan, freePlan, current] = await Promise.all([
      tx.organization.findUnique({ where: { id: attempt.organizationId } }),
      tx.planDefinition.findUnique({ where: { key: attempt.planKey } }),
      tx.planDefinition.findUnique({ where: { key: 'FREE' } }),
      tx.organizationSubscription.findUnique({ where: { organizationId: attempt.organizationId } }),
    ]);
    if (!organization || !plan || !freePlan) throw new Error('Organización o plan de billing desconocido.');

    if (current?.providerSubscriptionId && current.providerSubscriptionId !== event.subscription.subscriptionId) {
      const currentAttempt = await tx.billingCheckoutAttempt.findUnique({
        where: { provider_providerSubscriptionId: { provider: current.provider, providerSubscriptionId: current.providerSubscriptionId } },
      });
      const replacesSupersededAttempt = Boolean(
        currentAttempt
        && ['EXPIRED', 'FAILED', 'CANCELED'].includes(currentAttempt.status)
        && attempt.createdAt.getTime() >= currentAttempt.createdAt.getTime(),
      );
      if (!replacesSupersededAttempt) {
        await tx.billingWebhookEvent.update({
          where: { id: eventId },
          data: { status: 'IGNORED', attempts: { increment: 1 }, processedAt: new Date(), lastError: 'Suscripción reemplazada por una más reciente.' },
        });
        return;
      }
    }

    await tx.organizationSubscription.upsert({
      where: { organizationId: organization.id },
      create: {
        organizationId: organization.id,
        planKey: plan.key,
        provider: event.provider,
        status: event.subscription.status,
        providerCustomerId: event.subscription.customerId,
        providerSubscriptionId: event.subscription.subscriptionId,
        currentPeriodStart: event.subscription.currentPeriodStart,
        currentPeriodEnd: event.subscription.currentPeriodEnd,
        cancelAtPeriodEnd: event.subscription.cancelAtPeriodEnd,
        trialEndsAt: event.subscription.trialEndsAt,
      },
      update: {
        planKey: plan.key,
        provider: event.provider,
        status: event.subscription.status,
        providerCustomerId: event.subscription.customerId,
        providerSubscriptionId: event.subscription.subscriptionId,
        currentPeriodStart: event.subscription.currentPeriodStart,
        currentPeriodEnd: event.subscription.currentPeriodEnd,
        cancelAtPeriodEnd: event.subscription.cancelAtPeriodEnd,
        trialEndsAt: event.subscription.trialEndsAt,
      },
    });

    const grantsPaidEntitlements = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED'].includes(event.subscription.status);
    if (grantsPaidEntitlements) {
      await tx.organization.update({
        where: { id: organization.id },
        data: { planKey: plan.key, seatLimit: attempt.seats },
      });
    } else if (event.subscription.status === 'CANCELED') {
      await tx.organization.update({
        where: { id: organization.id },
        data: { planKey: freePlan.key, seatLimit: freePlan.defaultSeatLimit },
      });
    }

    await tx.billingCheckoutAttempt.update({
      where: { id: attempt.id },
      data: {
        providerSubscriptionId: event.subscription.subscriptionId,
        status: attemptStatus(event.subscription.status),
      },
    });
    await tx.billingWebhookEvent.update({
      where: { id: eventId },
      data: { status: 'PROCESSED', attempts: { increment: 1 }, processedAt: new Date(), lastError: null },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function attemptStatus(status: VerifiedBillingEvent['subscription']['status']): string {
  if (status === 'ACTIVE' || status === 'TRIALING') return 'ACTIVE';
  if (status === 'CANCELED') return 'CANCELED';
  return status;
}

function assertAppOrigin(value: string): URL {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('PULSO_APP_URL debe ser un origen sin ruta.');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('PULSO_APP_URL debe usar HTTPS.');
  return url;
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Error de billing';
  return message.replace(/[\r\n\t]/g, ' ').slice(0, 240);
}
