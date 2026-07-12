import { describe, expect, it } from 'vitest';
import { MockBillingProvider } from './provider';

const secret = 'synthetic-mock-secret-only';

function body(id = 'evt-unit-1') {
  return JSON.stringify({
    id,
    type: 'SUBSCRIPTION_UPDATED',
    subscription: {
      organizationId: 'org-unit', planKey: 'TEAM', status: 'ACTIVE',
      customerId: 'cus-unit', subscriptionId: 'sub-unit',
      currentPeriodStart: '2026-07-01T00:00:00.000Z',
      currentPeriodEnd: '2026-08-01T00:00:00.000Z', cancelAtPeriodEnd: false, trialEndsAt: null,
    },
  });
}

describe('MockBillingProvider', () => {
  it('verifica firma antes de interpretar el evento', async () => {
    const provider = new MockBillingProvider(secret);
    await expect(provider.handleWebhook(body(), 'sha256=invalid')).rejects.toThrow('Firma');
    await expect(provider.handleWebhook(body(), provider.sign(body()))).resolves.toMatchObject({
      provider: 'MOCK', externalEventId: 'evt-unit-1', subscription: { planKey: 'TEAM' },
    });
  });

  it('no simula una URL de cobro o portal real', async () => {
    const provider = new MockBillingProvider(secret);
    const customer = await provider.createCustomer({ organizationId: 'org-unit', email: 'owner@integration.invalid' });
    await expect(provider.createCheckoutSession({ organizationId: 'org-unit', customerId: customer.customerId, planKey: 'TEAM' }))
      .resolves.toMatchObject({ provider: 'MOCK', url: null });
    await expect(provider.createCustomerPortalSession(customer)).resolves.toMatchObject({ provider: 'MOCK', url: null });
  });
});
