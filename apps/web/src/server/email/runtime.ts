import type { EmailProvider } from './provider';
import { MockEmailProvider } from './provider';
import { GmailEmailProvider } from './gmail';

export function createRuntimeEmailProvider(): EmailProvider {
  const provider = process.env.PULSO_EMAIL_PROVIDER ?? 'MOCK';
  if (provider === 'MOCK') {
    if (process.env.NODE_ENV === 'production') throw new Error('El proveedor email MOCK está prohibido en producción.');
    return new MockEmailProvider();
  }
  if (provider !== 'GMAIL_OAUTH') throw new Error('PULSO_EMAIL_PROVIDER inválido.');
  return new GmailEmailProvider({
    clientId: required('GOOGLE_GMAIL_CLIENT_ID'),
    clientSecret: required('GOOGLE_GMAIL_CLIENT_SECRET'),
    refreshTokenEncrypted: required('GOOGLE_GMAIL_REFRESH_TOKEN_ENCRYPTED'),
    sender: required('GOOGLE_GMAIL_SENDER'),
  });
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio.`);
  return value;
}
