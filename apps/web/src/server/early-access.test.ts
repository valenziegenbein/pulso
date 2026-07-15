import { describe, expect, it } from 'vitest';
import { EARLY_ACCESS_PRODUCT, productFromContact, productFromContactMessage } from './early-access';

describe('clasificación de acceso anticipado', () => {
  it('distingue Personal Local de Personal AI sin confiar en un campo arbitrario del cliente', () => {
    expect(productFromContactMessage('Producto solicitado: Personal Local / BYOK\nWindows 11')).toBe(EARLY_ACCESS_PRODUCT.PERSONAL_LOCAL);
    expect(productFromContactMessage('Producto solicitado: Personal AI\nWindows 11')).toBe(EARLY_ACCESS_PRODUCT.PERSONAL_AI);
    expect(productFromContactMessage('Consulta general')).toBe(EARLY_ACCESS_PRODUCT.PERSONAL_AI);
  });

  it('deriva Teams del topic validado por el servidor', () => {
    expect(productFromContact('teams', 'Necesito un piloto para mi equipo.')).toBe(EARLY_ACCESS_PRODUCT.TEAMS);
    expect(productFromContact('business', 'Consulta comercial.')).toBe(EARLY_ACCESS_PRODUCT.TEAMS);
    expect(productFromContact('personal-ai', 'Producto solicitado: Personal AI')).toBe(EARLY_ACCESS_PRODUCT.PERSONAL_AI);
  });
});
