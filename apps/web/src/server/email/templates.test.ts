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
  it('renderiza consultas sin interpretar HTML ni saltos de línea en el asunto', () => {
    const email = renderEmail('CONTACT_REQUEST', 'owner@integration.invalid', {
      name: 'Ada\r\nBcc: attacker@example.com',
      senderEmail: 'ada@example.com',
      topic: 'teams',
      message: '<script>alert(1)</script>\nNecesito una demo.',
    });
    expect(email.subject).not.toContain('\n');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).not.toContain('<script>');
    expect(email.text).toContain('ada@example.com');
  });

  it('responde una solicitud y una aprobación de acceso anticipado sin filtrar HTML', () => {
    const received = renderEmail('EARLY_ACCESS_RECEIVED', 'person@integration.invalid', {
      name: '<Ada>', product: 'Pulso Personal AI',
    });
    expect(received.subject).toContain('solicitud');
    expect(received.html).toContain('&lt;Ada&gt;');

    const approved = renderEmail('EARLY_ACCESS_APPROVED', 'person@integration.invalid', {
      name: 'Ada', product: 'Pulso Personal AI', actionUrl: 'https://pulso.invalid/early-access/claim?token=synthetic',
    });
    expect(approved.subject).toContain('aprobado');
    expect(approved.text).toContain('https://pulso.invalid/early-access/claim?token=synthetic');
  });

  it('acepta un piloto Teams sin inventar un alta Personal ni requerir URL pública', () => {
    const approved = renderEmail('EARLY_ACCESS_TEAMS_APPROVED', 'team@integration.invalid', {
      name: 'Equipo Ada', product: 'Pulso Teams',
    });
    expect(approved.subject).toContain('Teams');
    expect(approved.text).toContain('configurar la organización');
    expect(approved.text).not.toContain('/early-access/claim');
    expect(approved.text).toContain('ningún pago');
  });
});
