'use server';

import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/context';
import { COMMERCIAL_OFFERS, priceVersionFromEnvironment, type CommercialOfferId } from '@/server/billing/catalog';
import { assertBillingCheckoutEnabled, billingProviderFromEnvironment } from '@/server/billing/config';
import { createMercadoPagoCheckout } from '@/server/billing/service';

export async function createBillingCheckoutAction(formData: FormData): Promise<void> {
  const ctx = await requireAuth();
  const value = formData.get('offerId');
  if (typeof value !== 'string' || !Object.hasOwn(COMMERCIAL_OFFERS, value)) throw new Error('Oferta comercial inválida.');
  assertBillingCheckoutEnabled();
  const provider = billingProviderFromEnvironment();
  if (provider.name !== 'MERCADO_PAGO') throw new Error('Los cobros todavía no están habilitados.');
  const priceVersion = priceVersionFromEnvironment();
  const appUrl = process.env.PULSO_APP_URL ?? '';
  const { session } = await createMercadoPagoCheckout(ctx, provider, value as CommercialOfferId, priceVersion, appUrl);
  if (!session.url) throw new Error('Mercado Pago no devolvió una URL de checkout.');
  redirect(session.url);
}
