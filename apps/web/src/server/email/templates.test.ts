import { describe, expect, it } from 'vitest';
import { renderEmail } from './templates';

describe('templates transaccionales', () => {
  it('genera HTML y texto sin exponer contenido no escapado', () => {
    const email = renderEmail('ORGANIZATION_INVITE', 'person@integration.invalid', {
      organizationName: '<Pulso & Co>', actionUrl: 'https://pulso.invalid/invite?token=synthetic',
    });
    expect(email.subject).toContain('<Pulso & Co>');
    expect(email.html).toContain('&lt;Pulso &amp; Co&gt;');
    expect(email.text).toContain('https://pulso.invalid/invite?token=synthetic');
  });

  it('rechaza HTTP en producción', () => {
    expect(() => renderEmail('VERIFY_EMAIL', 'person@integration.invalid', { actionUrl: 'http://example.com/verify' }, true)).toThrow('HTTPS');
  });
});
