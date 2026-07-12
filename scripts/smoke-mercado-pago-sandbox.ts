import { randomUUID } from 'node:crypto';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';

const ACK = 'create-and-cancel-test-subscription';
const SANDBOX_AMOUNT_ARS = 100;

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
    await cleanupOrphanedSmokeSubscriptions(client, payerEmail);
    const created = await client.create({
      body: {
        reason: 'Pulso · smoke sandbox reversible',
        external_reference: `pulso-sandbox-smoke-${randomUUID()}`,
        payer_email: payerEmail,
        auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: SANDBOX_AMOUNT_ARS, currency_id: 'ARS' },
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
    const cleaned = await cleanupOrphanedSmokeSubscriptions(client, payerEmail);
    console.log(`Mercado Pago TEST orphan cleanup: OK (${cleaned} cancelled)`);
  }
}

async function cleanupOrphanedSmokeSubscriptions(client: PreApproval, payerEmail: string): Promise<number> {
  const search = await client.search({ options: { payer_email: payerEmail, limit: 100, offset: 0 } });
  let cleaned = 0;
  for (const item of search.results ?? []) {
    const reference = String(item.external_reference ?? '');
    if (
      item.id
      && item.reason === 'Pulso · smoke sandbox reversible'
      && reference.startsWith('pulso-sandbox-smoke-')
      && item.status !== 'cancelled'
      && item.status !== 'canceled'
    ) {
      await client.update({ id: item.id, body: { status: 'cancelled' } });
      const checked = await client.get({ id: item.id });
      if (checked.status !== 'cancelled' && checked.status !== 'canceled') throw new Error('No se pudo limpiar una preapproval smoke huérfana.');
      cleaned += 1;
    }
  }
  return cleaned;
}

void main().catch((error: unknown) => {
  console.error(formatSafeError(error));
  process.exitCode = 1;
});

function formatSafeError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Falló el smoke sandbox de Mercado Pago: error no identificado.';
  const record = error as Record<string, unknown>;
  const name = error instanceof Error ? error.name : 'ProviderError';
  const message = error instanceof Error && error.message ? error.message : 'sin mensaje';
  const status = typeof record.status === 'number' ? record.status : undefined;
  const code = typeof record.code === 'string' || typeof record.code === 'number' ? String(record.code) : undefined;
  const keys = Object.keys(record).filter((key) => !/token|authorization|request|response|config|headers|body|cause/i.test(key)).slice(0, 8);
  const provider = safeProviderMessage(record.message) ?? safeProviderMessage(record.cause);
  return JSON.stringify({ event: 'mercado_pago_sandbox_smoke_failed', name, message, status, code, provider, keys });
}

function safeProviderMessage(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') return { message: value.replace(/[\r\n\t]/g, ' ').slice(0, 240) };
  if (Array.isArray(value)) {
    return {
      issues: value.slice(0, 4).map((item) => {
        if (!item || typeof item !== 'object') return String(item).slice(0, 80);
        const issue = item as Record<string, unknown>;
        return Object.fromEntries(['error', 'message', 'code', 'description'].flatMap((key) => {
          const field = issue[key];
          return typeof field === 'string' || typeof field === 'number' ? [[key, String(field).replace(/[\r\n\t]/g, ' ').slice(0, 240)]] : [];
        }));
      }),
    };
  }
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of ['error', 'message', 'status', 'code']) {
    const item = input[key];
    if (typeof item === 'string') result[key] = item.replace(/[\r\n\t]/g, ' ').slice(0, 240);
    else if (typeof item === 'number') result[key] = item;
  }
  if (Array.isArray(input.cause)) {
    result.cause = input.cause.slice(0, 4).map((item) => {
      if (!item || typeof item !== 'object') return 'invalid';
      const cause = item as Record<string, unknown>;
      return {
        code: typeof cause.code === 'string' || typeof cause.code === 'number' ? String(cause.code).slice(0, 80) : undefined,
        description: typeof cause.description === 'string' ? cause.description.replace(/[\r\n\t]/g, ' ').slice(0, 240) : undefined,
      };
    });
  }
  return Object.keys(result).length ? result : undefined;
}
