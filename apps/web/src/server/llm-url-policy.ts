import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { LLMProviderType } from '@pulso/shared';

type Resolver = (hostname: string) => Promise<Array<{ address: string }>>;

const OFFICIAL_PUBLIC_HOSTS = new Set(['api.openai.com', 'api.anthropic.com']);
const FORBIDDEN_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.google',
  'instance-data.ec2.internal',
]);

export class LlmUrlPolicyError extends Error {
  constructor(message = 'Destino LLM no autorizado.') {
    super(message);
    this.name = 'LlmUrlPolicyError';
  }
}

function envHosts(name: 'LLM_ALLOWED_PUBLIC_HOSTS' | 'LLM_ALLOWED_PRIVATE_HOSTS'): Set<string> {
  return new Set(
    (process.env[name] ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function defaultResolver(hostname: string): Promise<Array<{ address: string }>> {
  return lookup(hostname, { all: true, verbatim: true });
}

export async function resolveProviderBaseUrl(
  providerType: LLMProviderType,
  requestedBaseUrl?: string | null,
  resolver: Resolver = defaultResolver,
): Promise<string | undefined> {
  if (providerType === 'MOCK') return undefined;
  if (providerType === 'ANTHROPIC') {
    await assertAllowedLlmUrl('https://api.anthropic.com', resolver);
    return 'https://api.anthropic.com';
  }
  if (!requestedBaseUrl) throw new LlmUrlPolicyError('Falta la URL del proveedor LLM.');
  const url = await assertAllowedLlmUrl(requestedBaseUrl, resolver);
  return url.toString().replace(/\/$/, '');
}

export async function assertAllowedLlmUrl(raw: string | URL, resolver: Resolver = defaultResolver): Promise<URL> {
  let url: URL;
  try {
    url = raw instanceof URL ? new URL(raw) : new URL(raw);
  } catch {
    throw new LlmUrlPolicyError('URL LLM inválida.');
  }
  if (url.username || url.password) throw new LlmUrlPolicyError('La URL LLM no puede incluir credenciales.');

  const hostname = url.hostname.toLowerCase();
  const host = url.host.toLowerCase();
  if (FORBIDDEN_HOSTNAMES.has(hostname)) throw new LlmUrlPolicyError();

  const publicHosts = new Set([...OFFICIAL_PUBLIC_HOSTS, ...envHosts('LLM_ALLOWED_PUBLIC_HOSTS')]);
  const privateHosts = envHosts('LLM_ALLOWED_PRIVATE_HOSTS');
  const publicAllowed = publicHosts.has(host) || (!url.port && publicHosts.has(hostname));
  const privateAllowed = privateHosts.has(host) || (!url.port && privateHosts.has(hostname));
  if (!publicAllowed && !privateAllowed) throw new LlmUrlPolicyError();
  if (publicAllowed && url.protocol !== 'https:') throw new LlmUrlPolicyError('Los proveedores públicos requieren HTTPS.');
  if (privateAllowed && url.protocol !== 'https:' && url.protocol !== 'http:') throw new LlmUrlPolicyError();

  const addresses = isIP(hostname) ? [{ address: hostname }] : await resolver(hostname);
  if (addresses.length === 0) throw new LlmUrlPolicyError('El host LLM no resolvió direcciones.');
  for (const { address } of addresses) {
    const kind = classifyAddress(address);
    if (kind === 'forbidden' || (kind === 'private' && !privateAllowed)) throw new LlmUrlPolicyError();
  }
  return url;
}

export function createSafeLlmFetch(timeoutMs: number, resolver: Resolver = defaultResolver): typeof fetch {
  return async (input, init) => {
    const requestUrl = input instanceof Request ? input.url : String(input);
    await assertAllowedLlmUrl(requestUrl, resolver);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, { ...init, redirect: 'manual', signal: controller.signal });
      if (response.status >= 300 && response.status < 400) {
        throw new LlmUrlPolicyError('Los redirects de proveedores LLM están bloqueados.');
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function classifyAddress(address: string): 'public' | 'private' | 'forbidden' {
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) return classifyAddress(normalized.slice(7));
  if (isIP(normalized) === 4) return classifyIpv4(normalized);
  if (isIP(normalized) === 6) {
    if (normalized === '::' || normalized === '::1' || normalized.startsWith('fe8') || normalized.startsWith('fe9')
      || normalized.startsWith('fea') || normalized.startsWith('feb')) return 'forbidden';
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return 'private';
    return 'public';
  }
  return 'forbidden';
}

function classifyIpv4(address: string): 'public' | 'private' | 'forbidden' {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return 'forbidden';
  const [a, b] = octets as [number, number, number, number];
  if (a === 0 || a === 127 || (a === 169 && b === 254)) return 'forbidden';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
  if ((a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19))) return 'private';
  if (a >= 224) return 'forbidden';
  return 'public';
}
