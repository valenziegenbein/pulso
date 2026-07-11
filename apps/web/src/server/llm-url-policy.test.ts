import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertAllowedLlmUrl, createSafeLlmFetch, resolveProviderBaseUrl } from './llm-url-policy';

const resolves = (...addresses: string[]) => async () => addresses.map((address) => ({ address }));

afterEach(() => {
  delete process.env.LLM_ALLOWED_PUBLIC_HOSTS;
  delete process.env.LLM_ALLOWED_PRIVATE_HOSTS;
  vi.unstubAllGlobals();
});

describe('LLM SSRF policy', () => {
  it('permite proveedores oficiales por HTTPS', async () => {
    await expect(assertAllowedLlmUrl('https://api.openai.com/v1', resolves('104.18.1.1'))).resolves.toBeInstanceOf(URL);
    await expect(resolveProviderBaseUrl('ANTHROPIC', undefined, resolves('160.79.1.1'))).resolves.toBe('https://api.anthropic.com');
  });

  it('rechaza loopback, link-local y metadata incluso en allowlist privada', async () => {
    process.env.LLM_ALLOWED_PRIVATE_HOSTS = '127.0.0.1,169.254.169.254,metadata.google.internal';
    await expect(assertAllowedLlmUrl('http://127.0.0.1:1234/v1')).rejects.toThrow();
    await expect(assertAllowedLlmUrl('http://169.254.169.254/latest')).rejects.toThrow();
    await expect(assertAllowedLlmUrl('http://metadata.google.internal/')).rejects.toThrow();
  });

  it('rechaza RFC1918 no autorizado y permite host privado explícito', async () => {
    process.env.LLM_ALLOWED_PUBLIC_HOSTS = 'llm.example.com';
    await expect(assertAllowedLlmUrl('https://llm.example.com/v1', resolves('10.0.0.8'))).rejects.toThrow();
    process.env.LLM_ALLOWED_PRIVATE_HOSTS = 'llm.internal:8443';
    await expect(assertAllowedLlmUrl('https://llm.internal:8443/v1', resolves('10.0.0.8'))).resolves.toBeInstanceOf(URL);
  });

  it('rechaza destinos no allowlisted y DNS rebinding', async () => {
    await expect(assertAllowedLlmUrl('https://evil.example/v1', resolves('203.0.113.2'))).rejects.toThrow();
    await expect(assertAllowedLlmUrl('https://api.openai.com/v1', resolves('192.168.1.20'))).rejects.toThrow();
  });

  it('bloquea redirects del proveedor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1' } })));
    const safeFetch = createSafeLlmFetch(1_000, resolves('104.18.1.1'));
    await expect(safeFetch('https://api.openai.com/v1/models')).rejects.toThrow('redirects');
  });
});
