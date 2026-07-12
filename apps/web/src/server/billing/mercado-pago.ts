import { createHash } from 'node:crypto';
import {
  InvalidWebhookSignatureError,
  MercadoPagoConfig,
  PreApproval,
  WebhookSignatureValidator,
} from 'mercadopago';
import type {
  BillingCheckoutInput,
  BillingProvider,
  BillingSession,
  BillingSubscriptionStatus,
  BillingWebhookInput,
  ProviderSubscriptionSnapshot,
  VerifiedBillingEvent,
} from './provider';
import { parseOptionalDate, shortHash } from './provider';

const MERCADO_PAGO_PROVIDER = 'MERCADO_PAGO';

interface PreApprovalResource {
  id?: string;
  payer_id?: number;
  payer_email?: string;
  status?: string;
  external_reference?: string;
  date_created?: string;
  next_payment_date?: string;
  init_point?: string;
  auto_recurring?: { transaction_amount?: number; currency_id?: string };
}

export interface MercadoPagoPreApprovalClient {
  create(input: {
    body: {
      reason: string;
      external_reference: string;
      payer_email: string;
      auto_recurring: { frequency: number; frequency_type: string; transaction_amount: number; currency_id: string };
      back_url: string;
    };
    requestOptions: { idempotencyKey: string };
  }): Promise<PreApprovalResource>;
  get(input: { id: string }): Promise<PreApprovalResource>;
  update(input: { id: string; body: { status: string } }): Promise<unknown>;
}

export interface MercadoPagoBillingConfig {
  accessToken: string;
  webhookSecret: string;
  mode: 'TEST' | 'PRODUCTION';
  client?: MercadoPagoPreApprovalClient;
}

export class MercadoPagoBillingProvider implements BillingProvider {
  readonly name = MERCADO_PAGO_PROVIDER;
  private readonly client: MercadoPagoPreApprovalClient;

  constructor(private readonly config: MercadoPagoBillingConfig) {
    assertCredentials(config);
    this.client = config.client ?? new PreApproval(new MercadoPagoConfig({
      accessToken: config.accessToken,
      options: { timeout: 8_000 },
    }));
  }

  async createCustomer(input: { organizationId: string; email: string }): Promise<{ customerId: string }> {
    return { customerId: `mp_payer_${shortHash(`${input.organizationId}:${input.email.toLowerCase()}`)}` };
  }

  async createCheckoutSession(input: BillingCheckoutInput): Promise<BillingSession> {
    assertCheckoutInput(input);
    const result = await this.client.create({
      body: {
        reason: `Pulso ${input.planKey} · ${input.price.seats} integrantes`,
        external_reference: input.checkoutReference,
        payer_email: input.customerEmail,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: input.price.chargedAmountCentavos / 100,
          currency_id: input.price.currency,
        },
        back_url: input.backUrl,
      },
      requestOptions: { idempotencyKey: input.checkoutReference },
    });
    if (!result.id || !result.init_point) throw new Error('Mercado Pago no devolvió un checkout válido.');
    assertMercadoPagoCheckoutUrl(result.init_point);
    return { provider: this.name, reference: result.id, url: result.init_point };
  }

  async createCustomerPortalSession(input: { customerId: string }): Promise<BillingSession> {
    return { provider: this.name, reference: `mp_portal_unavailable_${shortHash(input.customerId)}`, url: null };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.client.update({ id: subscriptionId, body: { status: 'cancelled' } });
  }

  async resumeSubscription(subscriptionId: string): Promise<void> {
    await this.client.update({ id: subscriptionId, body: { status: 'authorized' } });
  }

  async getSubscription(subscriptionId: string): Promise<ProviderSubscriptionSnapshot | null> {
    const resource = await this.client.get({ id: subscriptionId });
    return resource.id ? snapshotFromPreApproval(resource) : null;
  }

  async handleWebhook(input: BillingWebhookInput): Promise<VerifiedBillingEvent> {
    try {
      WebhookSignatureValidator.validate({
        xSignature: input.signature,
        xRequestId: input.requestId,
        dataId: input.dataId,
        secret: this.config.webhookSecret,
      });
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) throw new MercadoPagoWebhookSignatureError();
      throw error;
    }

    const notification = parseNotification(input.rawBody, input.dataId);
    const resource = await this.client.get({ id: input.dataId });
    if (resource.id !== input.dataId) throw new Error('Mercado Pago devolvió un recurso distinto al notificado.');
    const subscription = snapshotFromPreApproval(resource);
    return {
      provider: this.name,
      externalEventId: `${notification.id}:${notification.action}:${input.dataId}`,
      type: subscription.status === 'CANCELED' ? 'SUBSCRIPTION_CANCELED' : 'SUBSCRIPTION_UPDATED',
      payloadHash: createHash('sha256').update(input.rawBody, 'utf8').digest('hex'),
      subscription,
    };
  }
}

export class MercadoPagoWebhookSignatureError extends Error {
  constructor() { super('Firma de webhook de Mercado Pago inválida.'); }
}

function assertCredentials(config: MercadoPagoBillingConfig): void {
  if (config.webhookSecret.length < 16) throw new Error('MERCADO_PAGO_WEBHOOK_SECRET inválido.');
  if (config.mode === 'TEST' && !config.accessToken.startsWith('TEST-')) {
    throw new Error('El sandbox de Mercado Pago exige una credencial TEST-.');
  }
  if (config.mode === 'PRODUCTION' && !config.accessToken.startsWith('APP_USR-')) {
    throw new Error('Mercado Pago productivo exige una credencial APP_USR-.');
  }
}

function assertCheckoutInput(input: BillingCheckoutInput): void {
  if (!input.checkoutReference || input.price.currency !== 'ARS') throw new Error('Checkout de Mercado Pago inválido.');
  if (!Number.isSafeInteger(input.price.chargedAmountCentavos) || input.price.chargedAmountCentavos <= 0) {
    throw new Error('Monto de Mercado Pago inválido.');
  }
  const email = input.customerEmail.trim();
  if (!email || email.length > 254 || !email.includes('@')) throw new Error('Email de checkout inválido.');
  const backUrl = new URL(input.backUrl);
  if (backUrl.protocol !== 'https:' && backUrl.hostname !== '127.0.0.1' && backUrl.hostname !== 'localhost') {
    throw new Error('La URL de retorno de Mercado Pago debe ser HTTPS.');
  }
}

function assertMercadoPagoCheckoutUrl(value: string): void {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || (host !== 'mercadopago.com' && !host.endsWith('.mercadopago.com') && !host.endsWith('.mercadopago.com.ar'))) {
    throw new Error('Mercado Pago devolvió una URL de checkout no autorizada.');
  }
}

function parseNotification(rawBody: string, dataId: string): { id: string; action: string } {
  let value: unknown;
  try { value = JSON.parse(rawBody); } catch { throw new Error('Payload de Mercado Pago inválido.'); }
  if (!value || typeof value !== 'object') throw new Error('Payload de Mercado Pago inválido.');
  const body = value as Record<string, unknown>;
  const data = body.data as Record<string, unknown> | undefined;
  const bodyDataId = data && (typeof data.id === 'string' || typeof data.id === 'number') ? String(data.id) : '';
  const type = typeof body.type === 'string' ? body.type : '';
  if (bodyDataId !== dataId || type !== 'subscription_preapproval') throw new Error('Notificación de Mercado Pago no soportada.');
  const id = typeof body.id === 'string' || typeof body.id === 'number' ? String(body.id) : '';
  const action = typeof body.action === 'string' ? body.action : '';
  if (!id || !action) throw new Error('Notificación de Mercado Pago incompleta.');
  return { id, action };
}

function snapshotFromPreApproval(resource: PreApprovalResource): ProviderSubscriptionSnapshot {
  if (!resource.id || !resource.external_reference) throw new Error('Suscripción de Mercado Pago sin referencia interna.');
  const currency = resource.auto_recurring?.currency_id;
  const amount = resource.auto_recurring?.transaction_amount;
  if (!currency || typeof amount !== 'number' || !Number.isFinite(amount)) throw new Error('Suscripción de Mercado Pago sin monto verificable.');
  const amountCentavos = Math.round(amount * 100);
  if (Math.abs(amount - amountCentavos / 100) > 1e-8 || amountCentavos <= 0) throw new Error('Monto de Mercado Pago inválido.');
  return {
    checkoutReference: resource.external_reference,
    status: mapStatus(resource.status),
    customerId: resource.payer_id ? String(resource.payer_id) : `mp_payer_${shortHash(resource.payer_email ?? resource.external_reference)}`,
    subscriptionId: resource.id,
    currentPeriodStart: parseOptionalDate(resource.date_created),
    currentPeriodEnd: parseOptionalDate(resource.next_payment_date),
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    currency,
    amountCentavos,
  };
}

function mapStatus(status: string | undefined): BillingSubscriptionStatus {
  switch (status) {
    case 'pending': return 'PENDING';
    case 'authorized': return 'ACTIVE';
    case 'paused': return 'PAUSED';
    case 'cancelled':
    case 'canceled': return 'CANCELED';
    default: throw new Error('Estado de suscripción de Mercado Pago desconocido.');
  }
}
