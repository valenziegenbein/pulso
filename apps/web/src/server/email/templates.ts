export type EmailTemplate =
  | 'VERIFY_EMAIL'
  | 'RESET_PASSWORD'
  | 'ORGANIZATION_INVITE'
  | 'CONTACT_REQUEST'
  | 'EARLY_ACCESS_RECEIVED'
  | 'EARLY_ACCESS_APPROVED'
  | 'EARLY_ACCESS_REJECTED'
  | 'EARLY_ACCESS_REVOKED';
type EarlyAccessEmailTemplate = Extract<EmailTemplate, `EARLY_ACCESS_${string}`>;

export function renderEmail(template: EmailTemplate, recipient: string, payload: Record<string, unknown>, production = process.env.NODE_ENV === 'production') {
  if (template === 'CONTACT_REQUEST') return renderContactRequest(recipient, payload);
  if (isEarlyAccessTemplate(template)) return renderEarlyAccessEmail(template, recipient, payload, production);
  const actionUrl = requireHttpsUrl(payload.actionUrl, production);
  const organization = typeof payload.organizationName === 'string' ? sanitizeHeader(payload.organizationName) : null;
  const catalog: Record<Exclude<EmailTemplate, 'CONTACT_REQUEST' | EarlyAccessEmailTemplate>, readonly [string, string]> = {
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

function renderEarlyAccessEmail(
  template: EarlyAccessEmailTemplate,
  recipient: string,
  payload: Record<string, unknown>,
  production: boolean,
) {
  const name = optionalText(payload.name, 120);
  const greeting = name ? `Hola, ${name}.` : 'Hola.';
  const product = optionalText(payload.product, 80) ?? 'Pulso Personal AI';
  if (template === 'EARLY_ACCESS_APPROVED') {
    const actionUrl = requireHttpsUrl(payload.actionUrl, production);
    return {
      to: recipient,
      subject: 'Tu acceso anticipado a Pulso fue aprobado',
      text: `${greeting}\n\nAprobamos tu acceso a ${product}. Completá el alta o iniciá sesión desde este enlace:\n\n${actionUrl}\n\nDespués abrí Pulso Desktop y elegí “Con mi cuenta Pulso”.`,
      html: `<p>${escapeHtml(greeting)}</p><p>Aprobamos tu acceso a ${escapeHtml(product)}.</p><p><a href="${escapeHtml(actionUrl)}">Completar alta o iniciar sesión</a></p><p>Después abrí Pulso Desktop y elegí “Con mi cuenta Pulso”.</p>`,
    };
  }
  const copy: { subject: string; body: string } = template === 'EARLY_ACCESS_RECEIVED'
    ? { subject: 'Recibimos tu solicitud de acceso anticipado', body: `Recibimos tu solicitud para ${product}. La revisión es manual y te avisaremos por este email antes de habilitar cualquier acceso o cobro.` }
    : template === 'EARLY_ACCESS_REJECTED'
      ? { subject: 'Actualización sobre tu solicitud de Pulso', body: `Por ahora no habilitaremos tu solicitud para ${product}. Podés responder este email si querés aportar más contexto.` }
      : { subject: 'Tu acceso anticipado a Pulso fue revocado', body: `El acceso anticipado a ${product} fue revocado. Tus datos locales permanecen en tu equipo; la IA administrada deja de estar disponible.` };
  return {
    to: recipient,
    subject: copy.subject,
    text: `${greeting}\n\n${copy.body}`,
    html: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(copy.body)}</p>`,
  };
}

function isEarlyAccessTemplate(template: EmailTemplate): template is EarlyAccessEmailTemplate {
  return template === 'EARLY_ACCESS_RECEIVED'
    || template === 'EARLY_ACCESS_APPROVED'
    || template === 'EARLY_ACCESS_REJECTED'
    || template === 'EARLY_ACCESS_REVOKED';
}

function renderContactRequest(recipient: string, payload: Record<string, unknown>) {
  const name = requireText(payload.name, 'nombre', 120);
  const senderEmail = requireText(payload.senderEmail, 'email', 254);
  const topic = requireText(payload.topic, 'tema', 40);
  const message = requireText(payload.message, 'mensaje', 4_000);
  const company = optionalText(payload.company, 160);
  const teamSize = optionalText(payload.teamSize, 40);
  const lines = [
    `Nombre: ${name}`,
    `Email: ${senderEmail}`,
    `Tema: ${topic}`,
    ...(company ? [`Empresa: ${company}`] : []),
    ...(teamSize ? [`Tamaño del equipo: ${teamSize}`] : []),
    '',
    message,
  ];
  return {
    to: recipient,
    subject: `Consulta web de ${sanitizeHeader(name)}`,
    text: lines.join('\n'),
    html: `<p><strong>Nombre:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> ${escapeHtml(senderEmail)}</p><p><strong>Tema:</strong> ${escapeHtml(topic)}</p>${company ? `<p><strong>Empresa:</strong> ${escapeHtml(company)}</p>` : ''}${teamSize ? `<p><strong>Tamaño del equipo:</strong> ${escapeHtml(teamSize)}</p>` : ''}<hr><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
  };
}

function requireText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Falta ${label} de contacto.`);
  return value.replace(/\r\n?/g, '\n').trim().slice(0, maxLength);
}

function optionalText(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.trim() ? value.replace(/[\r\n\t]/g, ' ').trim().slice(0, maxLength) : null;
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
