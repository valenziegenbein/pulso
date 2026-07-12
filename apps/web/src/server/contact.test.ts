import { describe, expect, it } from 'vitest';
import { contactRateLimitKey, isAllowedContactOrigin, parseContactRequest } from './contact';

describe('contact requests', () => {
  const valid = { topic: 'teams', name: 'Ada', email: 'ADA@example.com', message: 'Necesito una demo de Pulso.', consent: true };

  it('normaliza una solicitud válida y conserva solo campos acotados', () => {
    expect(parseContactRequest({ ...valid, company: ' Pulso ', ignored: 'x' })).toEqual({
      topic: 'teams', name: 'Ada', email: 'ada@example.com', company: 'Pulso', message: valid.message, consent: true,
    });
  });

  it('rechaza temas, emails, consentimiento y mensajes inválidos', () => {
    expect(parseContactRequest({ ...valid, topic: 'admin' })).toBeNull();
    expect(parseContactRequest({ ...valid, email: 'invalid' })).toBeNull();
    expect(parseContactRequest({ ...valid, consent: false })).toBeNull();
    expect(parseContactRequest({ ...valid, message: 'corto' })).toBeNull();
  });

  it('genera una clave opaca y estable sin incluir el email', () => {
    const parsed = parseContactRequest(valid)!;
    const key = contactRateLimitKey(parsed);
    expect(key).toHaveLength(64);
    expect(key).not.toContain(parsed.email);
    expect(key).toBe(contactRateLimitKey(parsed));
  });

  it('acepta únicamente el origen de marketing configurado y falla cerrado en producción', () => {
    expect(isAllowedContactOrigin('https://pulso.syswarm.com', 'https://pulso.syswarm.com', true)).toBe(true);
    expect(isAllowedContactOrigin('https://evil.example', 'https://pulso.syswarm.com', true)).toBe(false);
    expect(isAllowedContactOrigin(null, undefined, true)).toBe(false);
    expect(isAllowedContactOrigin('http://localhost:3000', undefined, false)).toBe(true);
  });
});
