import { MercadoPagoBillingProvider, type MercadoPagoPreApprovalClient } from './mercado-pago';
import { MercadoPagoMockBillingProvider, type BillingProvider } from './provider';

export type BillingProviderKind = 'MERCADO_PAGO_MOCK' | 'MERCADO_PAGO';

export function billingProviderKind(env: Record<string, string | undefined> = process.env): BillingProviderKind {
  const value = env.PULSO_BILLING_PROVIDER ?? 'MERCADO_PAGO_MOCK';
  if (value !== 'MERCADO_PAGO_MOCK' && value !== 'MERCADO_PAGO') throw new Error('PULSO_BILLING_PROVIDER inválido.');
  return value;
}

export function billingProviderFromEnvironment(
  env: Record<string, string | undefined> = process.env,
  client?: MercadoPagoPreApprovalClient,
): BillingProvider {
  const kind = billingProviderKind(env);
  if (kind === 'MERCADO_PAGO_MOCK') {
    const secret = env.BILLING_MOCK_WEBHOOK_SECRET ?? env.AUTH_SECRET ?? '';
    return new MercadoPagoMockBillingProvider(secret);
  }

  const mode = env.MERCADO_PAGO_MODE;
  if (mode !== 'TEST' && mode !== 'PRODUCTION') throw new Error('MERCADO_PAGO_MODE debe ser TEST o PRODUCTION.');
  if (mode === 'PRODUCTION' && env.PULSO_MERCADO_PAGO_LIVE_ENABLED !== 'true') {
    throw new Error('Los cobros productivos requieren PULSO_MERCADO_PAGO_LIVE_ENABLED=true.');
  }
  return new MercadoPagoBillingProvider({
    accessToken: env.MERCADO_PAGO_ACCESS_TOKEN ?? '',
    webhookSecret: env.MERCADO_PAGO_WEBHOOK_SECRET ?? '',
    mode,
    client,
  });
}

export function isRealBillingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  try {
    return billingProviderKind(env) === 'MERCADO_PAGO';
  } catch {
    return false;
  }
}

export function isBillingCheckoutReady(env: Record<string, string | undefined> = process.env): boolean {
  if (!isRealBillingEnabled(env) || env.PULSO_MERCADO_PAGO_CHECKOUT_ENABLED !== 'true') return false;
  try {
    billingProviderFromEnvironment(env);
    return true;
  } catch {
    return false;
  }
}

export function assertBillingCheckoutEnabled(env: Record<string, string | undefined> = process.env): void {
  if (env.PULSO_MERCADO_PAGO_CHECKOUT_ENABLED !== 'true') {
    throw new Error('Checkout Mercado Pago deshabilitado por feature flag.');
  }
}
