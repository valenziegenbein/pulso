export type EmailTemplate = 'VERIFY_EMAIL' | 'RESET_PASSWORD' | 'ORGANIZATION_INVITE';

export function renderEmail(template: EmailTemplate, recipient: string, payload: Record<string, unknown>, production = process.env.NODE_ENV === 'production') {
  const actionUrl = requireHttpsUrl(payload.actionUrl, production);
  const organization = typeof payload.organizationName === 'string' ? sanitizeHeader(payload.organizationName) : null;
  const catalog: Record<EmailTemplate, readonly [string, string]> = {
    VERIFY_EMAIL: ['Verificá tu email en Pulso', 'Confirmá tu dirección para continuar.'],
    RESET_PASSWORD: ['Restablecé tu contraseña de Pulso', 'Usá este enlace de un solo uso para elegir una contraseña nueva.'],
    ORGANIZATION_INVITE: [`Te invitaron a ${organization ?? 'una organización'} en Pulso`, 'Aceptá la invitación para sumarte al espacio de trabajo.'],
  };
  const content = catalog[template];
  const safeUrl = escapeHtml(actionUrl);
  return {
    to: recipient,
    subject: content[0],
    text: `${content[1]}\n\n${actionUrl}\n\nSi no esperabas este mensaje, podés ignorarlo.`,
    html: `${organization ? `<p>Organización: ${escapeHtml(organization)}</p>` : ''}<p>${escapeHtml(content[1])}</p><p><a href="${safeUrl}">Continuar en Pulso</a></p><p>Si no esperabas este mensaje, podés ignorarlo.</p>`,
  };
}

function requireHttpsUrl(value: unknown, production: boolean): string {
  if (typeof value !== 'string') throw new Error('Falta URL de acción.');
  const url = new URL(value);
  if (url.protocol !== 'https:' && !(!production && url.hostname === '127.0.0.1')) {
    throw new Error('La URL de email debe usar HTTPS.');
  }
  return url.toString();
}

function sanitizeHeader(value: string): string { return value.replace(/[\r\n\t]/g, ' ').trim().slice(0, 160); }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
