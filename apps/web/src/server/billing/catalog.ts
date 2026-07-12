export const LAUNCH_DISCOUNT_BPS = 2_500;
export const LAUNCH_DISCOUNT_MONTHS = 12;

export const COMMERCIAL_OFFERS = {
  'teams-5': { planKey: 'TEAM', seats: 5, monthlyUsdCents: 4_900 },
  'teams-10': { planKey: 'TEAM', seats: 10, monthlyUsdCents: 8_900 },
  'business-50': { planKey: 'BUSINESS', seats: 50, monthlyUsdCents: 39_900 },
} as const;

export type CommercialOfferId = keyof typeof COMMERCIAL_OFFERS;

export interface PriceVersion {
  id: string;
  arsCentavosPerUsd: number;
  validUntil: Date;
}

export function quoteLaunchOffer(offerId: CommercialOfferId, version: PriceVersion, now = new Date()) {
  if (!version.id.trim() || !Number.isSafeInteger(version.arsCentavosPerUsd) || version.arsCentavosPerUsd <= 0) {
    throw new Error('Versión de precio ARS inválida.');
  }
  if (!Number.isFinite(version.validUntil.getTime()) || version.validUntil.getTime() <= now.getTime()) {
    throw new Error('La tabla de precios ARS está vencida.');
  }
  const offer = COMMERCIAL_OFFERS[offerId];
  const listArsCentavos = convertUsdCentsToArsCentavos(offer.monthlyUsdCents, version.arsCentavosPerUsd);
  const launchArsCentavos = applyDiscount(listArsCentavos, LAUNCH_DISCOUNT_BPS);
  return {
    offerId,
    priceVersionId: version.id,
    currency: 'ARS' as const,
    listArsCentavos,
    launchArsCentavos,
    discountBps: LAUNCH_DISCOUNT_BPS,
    discountMonths: LAUNCH_DISCOUNT_MONTHS,
    planKey: offer.planKey,
    seats: offer.seats,
  };
}

export function priceVersionFromEnvironment(env: Record<string, string | undefined> = process.env): PriceVersion {
  const rate = Number(env.PULSO_USD_ARS_RATE);
  const validUntil = new Date(env.PULSO_PRICE_VALID_UNTIL ?? '');
  const id = env.PULSO_PRICE_VERSION ?? '';
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Falta PULSO_USD_ARS_RATE válido.');
  return { id, arsCentavosPerUsd: Math.round(rate * 100), validUntil };
}

function convertUsdCentsToArsCentavos(usdCents: number, arsCentavosPerUsd: number): number {
  const numerator = BigInt(usdCents) * BigInt(arsCentavosPerUsd);
  return Number((numerator + 50n) / 100n);
}

function applyDiscount(amount: number, discountBps: number): number {
  const numerator = BigInt(amount) * BigInt(10_000 - discountBps);
  return Number((numerator + 5_000n) / 10_000n);
}
