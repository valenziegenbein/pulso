import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptSecret } from '@pulso/database';
import { GmailEmailProvider } from './gmail';

beforeEach(() => {
  process.env.WORKLOG_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

describe('GmailEmailProvider', () => {
  it('refreshes with fixed endpoints and sends a base64url MIME message', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes('oauth2.googleapis.com')) {
        return Response.json({ access_token: 'synthetic-access', scope: 'https://www.googleapis.com/auth/gmail.send' });
      }
      return Response.json({ id: 'gmail-message-1' });
    }) as typeof fetch;
    const provider = new GmailEmailProvider({
      clientId: 'synthetic-client',
      clientSecret: 'synthetic-secret',
      refreshTokenEncrypted: encryptSecret('synthetic-refresh'),
      sender: 'sender@integration.invalid',
      fetchImpl,
    });

    await expect(provider.sendEmail({
      to: 'person@integration.invalid',
      subject: 'Verificá Pulso',
      text: 'Texto seguro',
      html: '<p>Texto seguro</p>',
    })).resolves.toEqual({ messageId: 'gmail-message-1' });

    expect(calls.map((call) => call.url)).toEqual([
      'https://oauth2.googleapis.com/token',
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    ]);
    expect(calls.every((call) => call.init?.redirect === 'error')).toBe(true);
    const tokenBody = calls[0]!.init?.body as URLSearchParams;
    expect(tokenBody.get('refresh_token')).toBe('synthetic-refresh');
    expect(calls[0]!.url).not.toContain('synthetic-secret');
    const messageBody = JSON.parse(String(calls[1]!.init?.body)) as { raw: string };
    const mime = Buffer.from(messageBody.raw, 'base64url').toString('utf8');
    expect(mime).toContain('To: person@integration.invalid');
    expect(mime).toContain('Content-Type: multipart/alternative');
    expect(mime).not.toContain('synthetic-refresh');
    expect(calls[1]!.init?.headers).toMatchObject({ authorization: 'Bearer synthetic-access' });
  });

  it('fails closed on missing scope, redirects and header injection', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ access_token: 'token', scope: 'openid' })) as typeof fetch;
    const provider = new GmailEmailProvider({
      clientId: 'client', clientSecret: 'secret', refreshTokenEncrypted: encryptSecret('refresh'),
      sender: 'sender@integration.invalid', fetchImpl,
    });
    await expect(provider.sendEmail({
      to: 'person@integration.invalid', subject: 'Subject', text: 'Text', html: '<p>Text</p>',
    })).rejects.toThrow('gmail.send');
    expect(() => new GmailEmailProvider({
      clientId: 'client', clientSecret: 'secret', refreshTokenEncrypted: encryptSecret('refresh'),
      sender: 'sender@integration.invalid\r\nBcc: attacker@invalid', fetchImpl,
    })).toThrow('Header');
  });

  it('does not include provider response bodies in errors', async () => {
    const fetchImpl = vi.fn(async () => new Response('sensitive-provider-body', { status: 401 })) as typeof fetch;
    const provider = new GmailEmailProvider({
      clientId: 'client', clientSecret: 'secret', refreshTokenEncrypted: encryptSecret('refresh'),
      sender: 'sender@integration.invalid', fetchImpl,
    });
    await expect(provider.verifyConnection()).resolves.toBe(false);
    await expect(provider.sendEmail({
      to: 'person@integration.invalid', subject: 'Subject', text: 'Text', html: '<p>Text</p>',
    })).rejects.not.toThrow('sensitive-provider-body');
  });
});
