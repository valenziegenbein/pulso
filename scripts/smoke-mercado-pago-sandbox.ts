import { randomUUID } from 'node:crypto';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';

const ACK = 'create-and-cancel-test-subscription';

async function main(): Promise<void> {
  if (process.env.PULSO_MERCADO_PAGO_SANDBOX_SMOKE_ACK !== ACK) {
    throw new Error(`Smoke bloqueado: PULSO_MERCADO_PAGO_SANDBOX_SMOKE_ACK debe ser ${ACK}.`);
  }
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN ?? '';
  if (!accessToken.startsWith('TEST-')) throw new Error('Smoke bloqueado: la credencial debe comenzar con TEST-.');
  const payerEmail = (process.env.MERCADO_PAGO_TEST_PAYER_EMAIL ?? '').trim().toLowerCase();
  if (!payerEmail.endsWith('@testuser.com')) throw new Error('Smoke bloqueado: falta un comprador @testuser.com de Mercado Pago.');
  const backUrl = new URL(process.env.MERCADO_PAGO_TEST_BACK_URL ?? '');
  if (backUrl.protocol !== 'https:') throw new Error('Smoke bloqueado: MERCADO_PAGO_TEST_BACK_URL debe usar HTTPS.');

  const client = new PreApproval(new MercadoPagoConfig({ accessToken, options: { timeout: 8_000 } }));
  let subscriptionId: string | undefined;
  try {
    const created = await client.create({
      body: {
        reason: 'Pulso · smoke sandbox reversible',
        external_reference: `pulso-sandbox-smoke-${randomUUID()}`,
        payer_email: payerEmail,
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 10, currency_id: 'ARS' },
        back_url: backUrl.toString(),
      },
    });
    if (!created.id || created.status !== 'pending' || !created.init_point) throw new Error('La preapproval de prueba no quedó pendiente.');
    subscriptionId = created.id;
    const fetched = await client.get({ id: subscriptionId });
    if (fetched.id !== subscriptionId || fetched.external_reference !== created.external_reference) {
      throw new Error('La consulta autoritativa no coincide con la preapproval creada.');
    }
    await client.update({ id: subscriptionId, body: { status: 'cancelled' } });
    const canceled = await client.get({ id: subscriptionId });
    if (canceled.status !== 'cancelled' && canceled.status !== 'canceled') throw new Error('La preapproval de prueba no se canceló.');
    subscriptionId = undefined;
    console.log('Mercado Pago TEST create → get → cancel → get smoke: OK');
  } finally {
    if (subscriptionId) {
      await client.update({ id: subscriptionId, body: { status: 'cancelled' } }).catch(() => undefined);
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Falló el smoke sandbox de Mercado Pago.');
  process.exitCode = 1;
});
