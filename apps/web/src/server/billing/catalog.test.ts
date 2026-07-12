import { describe, expect, it } from 'vitest';
import { priceVersionFromEnvironment, quoteLaunchOffer } from './catalog';

describe('catálogo comercial versionado', () => {
  it('aplica 25% sin usar floats monetarios en el resultado', () => {
    const quote = quoteLaunchOffer('teams-5', {
      id: 'ars-2026-07-a', arsCentavosPerUsd: 100_000,
      validUntil: new Date('2026-08-01T00:00:00Z'),
    }, new Date('2026-07-12T00:00:00Z'));
    expect(quote).toMatchObject({
      listArsCentavos: 4_900_000,
      launchArsCentavos: 3_675_000,
      discountBps: 2_500,
      discountMonths: 12,
      seats: 5,
    });
  });

  it('falla cerrado si la cotización venció o no está configurada', () => {
    expect(() => quoteLaunchOffer('teams-5', {
      id: 'stale', arsCentavosPerUsd: 100_000, validUntil: new Date('2026-07-01T00:00:00Z'),
    }, new Date('2026-07-12T00:00:00Z'))).toThrow('vencida');
    expect(() => priceVersionFromEnvironment({})).toThrow('PULSO_USD_ARS_RATE');
  });
});
