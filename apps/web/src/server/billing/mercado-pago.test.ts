import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { billingProviderFromEnvironment, isBillingCheckoutReady } from './config';
import { MercadoPagoBillingProvider, MercadoPagoWebhookSignatureError, type MercadoPagoPreApprovalClient } from './mercado-pago';

const accessToken = 'TEST-synthetic-access-token';
const webhookSecret = 'synthetic-mp-webhook-secret';

function client(overrides: Partial<MercadoPagoPreApprovalClient> = {}): MercadoPagoPreApprovalClient {
  return {
    create: vi.fn(async () => ({
      id: 'preapproval-unit',
      init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=preapproval-unit',
    })),
    get: vi.fn(async ({ id }) => ({
      id,
      payer_id: 123,
      status: 'authorized',
      external_reference: 'checkout-unit',
      date_created: '2026-07-12T20:00:00.000Z',
      next_payment_date: '2026-08-12T20:00:00.000Z',
      auto_recurring: { transaction_amount: 36_750, currency_id: 'ARS' },
    })),
    update: vi.fn(async () => ({})),
    ...overrides,
  };
}

function provider(api = client()) {
  return new MercadoPagoBillingProvider({ accessToken, webhookSecret, mode: 'TEST', client: api });
}

function checkoutInput() {
  return {
    organizationId: 'org-unit', customerId: 'customer-unit', customerEmail: 'owner@integration.invalid',
    planKey: 'TEAM' as const, checkoutReference: 'checkout-unit', backUrl: 'https://app.pulso.invalid/billing',
    price: {
      offerId: 'teams-5', priceVersionId: 'ars-2026-07', currency: 'ARS' as const,
      listAmountCentavos: 4_900_000, chargedAmountCentavos: 3_675_000,
      discountBps: 2_500, discountMonths: 12, seats: 5,
    },
  };
}

function notification(dataId = 'preapproval-unit') {
  return JSON.stringify({
    id: 9001,
    live_mode: false,
    type: 'subscription_preapproval',
    action: 'updated',
    data: { id: dataId },
  });
}

function signedInput(rawBody: string, dataId = 'preapproval-unit') {
  const requestId = 'request-unit-123';
  const ts = '1704908010';
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const signature = createHmac('sha256', webhookSecret).update(manifest).digest('hex');
  return { rawBody, dataId, requestId, signature: `ts=${ts},v1=${signature}` };
}

describe('MercadoPagoBillingProvider', () => {
  it('crea una preapproval mensual con el monto ARS versionado y referencia interna', async () => {
    const api = client();
    await expect(provider(api).createCheckoutSession(checkoutInput())).resolves.toMatchObject({
      provider: 'MERCADO_PAGO', reference: 'preapproval-unit',
      url: expect.stringContaining('mercadopago.com.ar/subscriptions/checkout'),
    });
    expect(api.create).toHaveBeenCalledWith({
      body: expect.objectContaining({
        external_reference: 'checkout-unit',
        payer_email: 'owner@integration.invalid',
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 36_750, currency_id: 'ARS' },
      }),
      requestOptions: { idempotencyKey: 'checkout-unit' },
    });
  });

  it('verifica la firma y consulta la preapproval autoritativa antes de emitir el evento', async () => {
    const api = client();
    const rawBody = notification();
    await expect(provider(api).handleWebhook(signedInput(rawBody))).resolves.toMatchObject({
      provider: 'MERCADO_PAGO',
      externalEventId: '9001:updated:preapproval-unit',
      subscription: {
        checkoutReference: 'checkout-unit', status: 'ACTIVE', subscriptionId: 'preapproval-unit',
        currency: 'ARS', amountCentavos: 3_675_000,
      },
    });
    expect(api.get).toHaveBeenCalledWith({ id: 'preapproval-unit' });
  });

  it('rechaza firma inválida, data.id manipulado y URL de checkout ajena', async () => {
    const rawBody = notification();
    await expect(provider().handleWebhook({ ...signedInput(rawBody), signature: 'ts=1704908010,v1=00' }))
      .rejects.toBeInstanceOf(MercadoPagoWebhookSignatureError);
    await expect(provider().handleWebhook(signedInput(rawBody, 'other-preapproval'))).rejects.toThrow('no soportada');
    const hostile = client({ create: vi.fn(async () => ({ id: 'preapproval-unit', init_point: 'https://evil.invalid/pay' })) });
    await expect(provider(hostile).createCheckoutSession(checkoutInput())).rejects.toThrow('no autorizada');
  });

  it('mantiene los cobros live detrás de un opt-in explícito y credenciales coherentes', () => {
    expect(() => billingProviderFromEnvironment({
      PULSO_BILLING_PROVIDER: 'MERCADO_PAGO', MERCADO_PAGO_MODE: 'TEST',
      MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-live', MERCADO_PAGO_WEBHOOK_SECRET: webhookSecret,
    }, client())).toThrow('TEST-');
    expect(() => billingProviderFromEnvironment({
      PULSO_BILLING_PROVIDER: 'MERCADO_PAGO', MERCADO_PAGO_MODE: 'PRODUCTION',
      MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-live', MERCADO_PAGO_WEBHOOK_SECRET: webhookSecret,
      PULSO_MERCADO_PAGO_LIVE_ENABLED: 'false',
    }, client())).toThrow('LIVE_ENABLED');
    const sandbox = {
      PULSO_BILLING_PROVIDER: 'MERCADO_PAGO', MERCADO_PAGO_MODE: 'TEST',
      MERCADO_PAGO_ACCESS_TOKEN: accessToken, MERCADO_PAGO_WEBHOOK_SECRET: webhookSecret,
    };
    expect(isBillingCheckoutReady(sandbox)).toBe(false);
    expect(isBillingCheckoutReady({ ...sandbox, PULSO_MERCADO_PAGO_CHECKOUT_ENABLED: 'true' })).toBe(true);
  });
});
