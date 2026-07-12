import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { PlanKey } from '@pulso/shared';

export type BillingSubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'PAUSED';
export type BillingEventType = 'SUBSCRIPTION_UPDATED' | 'PAYMENT_SUCCEEDED' | 'PAYMENT_FAILED' | 'SUBSCRIPTION_CANCELED';

export interface BillingSubscriptionSnapshot {
  organizationId: string;
  planKey: PlanKey;
  status: BillingSubscriptionStatus;
  customerId: string;
  subscriptionId: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: Date | null;
}

export interface VerifiedBillingEvent {
  provider: string;
  externalEventId: string;
  type: BillingEventType;
  payloadHash: string;
  subscription: BillingSubscriptionSnapshot;
}

export interface BillingSession {
  provider: string;
  reference: string;
  url: string | null;
}

export interface BillingProvider {
  readonly name: string;
  createCustomer(input: { organizationId: string; email: string }): Promise<{ customerId: string }>;
  createCheckoutSession(input: { organizationId: string; customerId: string; planKey: PlanKey }): Promise<BillingSession>;
  createCustomerPortalSession(input: { customerId: string }): Promise<BillingSession>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  resumeSubscription(subscriptionId: string): Promise<void>;
  getSubscription(subscriptionId: string): Promise<BillingSubscriptionSnapshot | null>;
  handleWebhook(rawBody: string, signature: string): Promise<VerifiedBillingEvent>;
}

/** Proveedor sólo para desarrollo/tests. No genera cobros ni URLs externas. */
export class MockBillingProvider implements BillingProvider {
  readonly name: string;
  private readonly subscriptions = new Map<string, BillingSubscriptionSnapshot>();

  constructor(private readonly webhookSecret: string, name = 'MOCK') {
    if (webhookSecret.length < 16) throw new Error('El secreto mock debe tener al menos 16 caracteres.');
    this.name = name;
  }

  async createCustomer(input: { organizationId: string; email: string }) {
    return { customerId: `mock_cus_${shortHash(`${input.organizationId}:${input.email.toLowerCase()}`)}` };
  }

  async createCheckoutSession(input: { organizationId: string; customerId: string; planKey: PlanKey }) {
    return { provider: this.name, reference: `mock_checkout_${shortHash(JSON.stringify(input))}`, url: null };
  }

  async createCustomerPortalSession(input: { customerId: string }) {
    return { provider: this.name, reference: `mock_portal_${shortHash(input.customerId)}`, url: null };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    const current = this.subscriptions.get(subscriptionId);
    if (current) this.subscriptions.set(subscriptionId, { ...current, cancelAtPeriodEnd: true });
  }

  async resumeSubscription(subscriptionId: string): Promise<void> {
    const current = this.subscriptions.get(subscriptionId);
    if (current) this.subscriptions.set(subscriptionId, { ...current, cancelAtPeriodEnd: false });
  }

  async getSubscription(subscriptionId: string): Promise<BillingSubscriptionSnapshot | null> {
    return this.subscriptions.get(subscriptionId) ?? null;
  }

  async handleWebhook(rawBody: string, signature: string): Promise<VerifiedBillingEvent> {
    const expected = `sha256=${createHmac('sha256', this.webhookSecret).update(rawBody, 'utf8').digest('hex')}`;
    if (!safeEqual(signature, expected)) throw new Error('Firma de webhook inválida.');
    const parsed = parseMockEvent(rawBody);
    this.subscriptions.set(parsed.subscription.subscriptionId, parsed.subscription);
    return { ...parsed, provider: this.name, payloadHash: createHash('sha256').update(rawBody, 'utf8').digest('hex') };
  }

  sign(rawBody: string): string {
    return `sha256=${createHmac('sha256', this.webhookSecret).update(rawBody, 'utf8').digest('hex')}`;
  }
}

/** Simula la semántica de Mercado Pago sin red, credenciales ni cobros. */
export class MercadoPagoMockBillingProvider extends MockBillingProvider {
  constructor(webhookSecret: string) {
    super(webhookSecret, 'MERCADO_PAGO_MOCK');
  }
}

function parseMockEvent(rawBody: string): Omit<VerifiedBillingEvent, 'provider' | 'payloadHash'> {
  let value: unknown;
  try { value = JSON.parse(rawBody); } catch { throw new Error('Payload de webhook inválido.'); }
  if (!value || typeof value !== 'object') throw new Error('Payload de webhook inválido.');
  const event = value as Record<string, unknown>;
  const sub = event.subscription as Record<string, unknown> | undefined;
  const types: BillingEventType[] = ['SUBSCRIPTION_UPDATED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'SUBSCRIPTION_CANCELED'];
  const statuses: BillingSubscriptionStatus[] = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'PAUSED'];
  const plans: PlanKey[] = ['FREE', 'TEAM', 'BUSINESS', 'ENTERPRISE'];
  if (typeof event.id !== 'string' || !types.includes(event.type as BillingEventType) || !sub) throw new Error('Evento de billing inválido.');
  if (typeof sub.organizationId !== 'string' || typeof sub.customerId !== 'string' || typeof sub.subscriptionId !== 'string') throw new Error('Suscripción de billing inválida.');
  if (!plans.includes(sub.planKey as PlanKey) || !statuses.includes(sub.status as BillingSubscriptionStatus)) throw new Error('Estado de billing inválido.');
  return {
    externalEventId: event.id,
    type: event.type as BillingEventType,
    subscription: {
      organizationId: sub.organizationId,
      planKey: sub.planKey as PlanKey,
      status: sub.status as BillingSubscriptionStatus,
      customerId: sub.customerId,
      subscriptionId: sub.subscriptionId,
      currentPeriodStart: parseOptionalDate(sub.currentPeriodStart),
      currentPeriodEnd: parseOptionalDate(sub.currentPeriodEnd),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd === true,
      trialEndsAt: parseOptionalDate(sub.trialEndsAt),
    },
  };
}

function parseOptionalDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error('Fecha de billing inválida.');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Fecha de billing inválida.');
  return date;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function shortHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 20);
}
