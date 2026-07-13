import { describe, expect, it } from 'vitest';
import { EARLY_ACCESS_PRODUCT, productFromContactMessage } from './early-access';

describe('clasificación de acceso anticipado', () => {
  it('distingue Personal Local de Personal AI sin confiar en un campo arbitrario del cliente', () => {
    expect(productFromContactMessage('Producto solicitado: Personal Local / BYOK\nWindows 11')).toBe(EARLY_ACCESS_PRODUCT.PERSONAL_LOCAL);
    expect(productFromContactMessage('Producto solicitado: Personal AI\nWindows 11')).toBe(EARLY_ACCESS_PRODUCT.PERSONAL_AI);
    expect(productFromContactMessage('Consulta general')).toBe(EARLY_ACCESS_PRODUCT.PERSONAL_AI);
  });
});
