import { afterEach, describe, expect, it } from 'vitest';
import { createRuntimeEmailProvider } from './runtime';

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

describe('runtime email provider', () => {
  it('allows the mock only outside production', () => {
    process.env.PULSO_EMAIL_PROVIDER = 'MOCK';
    setNodeEnv('test');
    expect(createRuntimeEmailProvider().name).toBe('MOCK');
    setNodeEnv('production');
    expect(() => createRuntimeEmailProvider()).toThrow('prohibido');
  });

  it('fails closed for unknown or incomplete providers', () => {
    process.env.PULSO_EMAIL_PROVIDER = 'UNKNOWN';
    expect(() => createRuntimeEmailProvider()).toThrow('inválido');
    process.env.PULSO_EMAIL_PROVIDER = 'GMAIL_OAUTH';
    delete process.env.GOOGLE_GMAIL_CLIENT_ID;
    expect(() => createRuntimeEmailProvider()).toThrow('GOOGLE_GMAIL_CLIENT_ID');
  });
});

function setNodeEnv(value: string): void {
  Object.defineProperty(process.env, 'NODE_ENV', { value, writable: true, configurable: true, enumerable: true });
}
