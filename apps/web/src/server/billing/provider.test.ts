import { describe, expect, it } from 'vitest';
import { MercadoPagoMockBillingProvider, MockBillingProvider } from './provider';

const secret = 'synthetic-mock-secret-only';

function body(id = 'evt-unit-1') {
  return JSON.stringify({
    id,
    type: 'SUBSCRIPTION_UPDATED',
    subscription: {
      checkoutReference: 'checkout-unit', status: 'ACTIVE', currency: 'ARS', amountCentavos: 36_750_00,
      customerId: 'cus-unit', subscriptionId: 'sub-unit',
      currentPeriodStart: '2026-07-01T00:00:00.000Z',
      currentPeriodEnd: '2026-08-01T00:00:00.000Z', cancelAtPeriodEnd: false, trialEndsAt: null,
    },
  });
}

describe('MockBillingProvider', () => {
  it('verifica firma antes de interpretar el evento', async () => {
    const provider = new MockBillingProvider(secret);
    const input = (signature: string) => ({ rawBody: body(), signature, requestId: 'request-unit', dataId: 'sub-unit' });
    await expect(provider.handleWebhook(input('sha256=invalid'))).rejects.toThrow('Firma');
    await expect(provider.handleWebhook(input(provider.sign(body())))).resolves.toMatchObject({
      provider: 'MOCK', externalEventId: 'evt-unit-1', subscription: { checkoutReference: 'checkout-unit' },
    });
  });

  it('no simula una URL de cobro o portal real', async () => {
    const provider = new MercadoPagoMockBillingProvider(secret);
    const customer = await provider.createCustomer({ organizationId: 'org-unit', email: 'owner@integration.invalid' });
    await expect(provider.createCheckoutSession({
      organizationId: 'org-unit', customerId: customer.customerId, customerEmail: 'owner@integration.invalid',
      planKey: 'TEAM', checkoutReference: 'checkout-unit', backUrl: 'https://pulso.invalid/billing',
      price: {
        offerId: 'teams-5', priceVersionId: 'ars-unit', currency: 'ARS', listAmountCentavos: 49_000_00,
        chargedAmountCentavos: 36_750_00, discountBps: 2_500, discountMonths: 12, seats: 5,
      },
    }))
      .resolves.toMatchObject({ provider: 'MERCADO_PAGO_MOCK', url: null });
    await expect(provider.createCustomerPortalSession(customer)).resolves.toMatchObject({ provider: 'MERCADO_PAGO_MOCK', url: null });
  });
});
