import { afterEach, describe, expect, it } from 'vitest';
import { POST } from './route';

const previous = {
  PULSO_BILLING_PROVIDER: process.env.PULSO_BILLING_PROVIDER,
  MERCADO_PAGO_MODE: process.env.MERCADO_PAGO_MODE,
  MERCADO_PAGO_ACCESS_TOKEN: process.env.MERCADO_PAGO_ACCESS_TOKEN,
  MERCADO_PAGO_WEBHOOK_SECRET: process.env.MERCADO_PAGO_WEBHOOK_SECRET,
};

afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('POST /api/billing/mercado-pago/webhook', () => {
  it('permanece oculto mientras producción usa el provider mock', async () => {
    process.env.PULSO_BILLING_PROVIDER = 'MERCADO_PAGO_MOCK';
    const response = await POST(new Request('http://localhost/api/billing/mercado-pago/webhook', { method: 'POST', body: '{}' }));
    expect(response.status).toBe(404);
  });

  it('limita el payload antes de cargar credenciales o tocar la base', async () => {
    process.env.PULSO_BILLING_PROVIDER = 'MERCADO_PAGO';
    const response = await POST(new Request('http://localhost/api/billing/mercado-pago/webhook', {
      method: 'POST', body: '{}', headers: { 'content-length': '65537' },
    }));
    expect(response.status).toBe(413);
    const chunked = await POST(new Request('http://localhost/api/billing/mercado-pago/webhook', {
      method: 'POST', body: 'x'.repeat(65_537),
    }));
    expect(chunked.status).toBe(413);
  });

  it('rechaza una firma inválida sin consultar recursos de billing', async () => {
    process.env.PULSO_BILLING_PROVIDER = 'MERCADO_PAGO';
    process.env.MERCADO_PAGO_MODE = 'TEST';
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-synthetic-access-token';
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'synthetic-webhook-secret';
    const response = await POST(new Request('http://localhost/api/billing/mercado-pago/webhook?data.id=preapproval-unit', {
      method: 'POST', body: JSON.stringify({ id: 1, type: 'subscription_preapproval', action: 'updated', data: { id: 'preapproval-unit' } }),
      headers: { 'x-signature': 'ts=1,v1=00', 'x-request-id': 'request-unit' },
    }));
    expect(response.status).toBe(401);
  });
});
