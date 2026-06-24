import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './crypto';

describe('secret encryption', () => {
  it('cifra API keys sin exponer el valor plano y permite descifrarlas', () => {
    process.env.WORKLOG_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const plain = 'sk-test-secret';
    const encrypted = encryptSecret(plain);

    expect(encrypted).not.toContain(plain);
    expect(encrypted.split(':')).toHaveLength(3);
    expect(decryptSecret(encrypted)).toBe(plain);
  });
});
