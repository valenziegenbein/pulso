import { decryptSecret } from '@pulso/database';
import type { EmailProvider, RenderedEmail } from './provider';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

type FetchLike = typeof fetch;

export interface GmailProviderConfig {
  clientId: string;
  clientSecret: string;
  refreshTokenEncrypted: string;
  sender: string;
  fetchImpl?: FetchLike;
}

export class GmailEmailProvider implements EmailProvider {
  readonly name = 'GMAIL_OAUTH';
  private readonly fetchImpl: FetchLike;

  constructor(private readonly config: GmailProviderConfig) {
    assertSafeHeader(config.sender, 'remitente');
    if (!config.sender.includes('@') || !config.clientId || !config.clientSecret || !config.refreshTokenEncrypted) {
      throw new Error('Configuración Gmail OAuth incompleta.');
    }
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async sendEmail(email: RenderedEmail): Promise<{ messageId: string }> {
    const accessToken = await this.refreshAccessToken();
    const response = await this.fetchImpl(SEND_ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ raw: encodeMimeMessage(this.config.sender, email) }),
    });
    if (!response.ok) throw new Error(`Gmail rechazó el envío (${response.status}).`);
    const body = await response.json() as { id?: unknown };
    if (typeof body.id !== 'string' || !body.id) throw new Error('Gmail no devolvió un ID de mensaje.');
    return { messageId: body.id };
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.refreshAccessToken();
      return true;
    } catch {
      return false;
    }
  }

  private async refreshAccessToken(): Promise<string> {
    const response = await this.fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: decryptSecret(this.config.refreshTokenEncrypted),
        grant_type: 'refresh_token',
      }),
    });
    if (!response.ok) throw new Error(`Google OAuth rechazó el refresh (${response.status}).`);
    const body = await response.json() as { access_token?: unknown; scope?: unknown };
    if (typeof body.access_token !== 'string' || !body.access_token) {
      throw new Error('Google OAuth no devolvió un access token.');
    }
    if (typeof body.scope === 'string' && !body.scope.split(' ').includes(GMAIL_SEND_SCOPE)) {
      throw new Error('El token OAuth no incluye gmail.send.');
    }
    return body.access_token;
  }
}

function encodeMimeMessage(sender: string, email: RenderedEmail): string {
  assertSafeHeader(sender, 'remitente');
  assertSafeHeader(email.to, 'destinatario');
  assertSafeHeader(email.subject, 'asunto');
  if (!email.to.includes('@')) throw new Error('Destinatario inválido.');
  const boundary = `pulso_${crypto.randomUUID().replaceAll('-', '')}`;
  const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64');
  const subject = `=?UTF-8?B?${encode(email.subject)}?=`;
  const mime = [
    `From: Pulso <${sender}>`,
    `To: ${email.to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encode(email.text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encode(email.html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return Buffer.from(mime, 'utf8').toString('base64url');
}

function assertSafeHeader(value: string, label: string): void {
  if (!value.trim() || /[\r\n\0]/.test(value)) throw new Error(`Header de ${label} inválido.`);
}
