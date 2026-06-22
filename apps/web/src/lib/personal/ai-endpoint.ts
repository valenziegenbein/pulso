// SERVER-ONLY. Utilidades para hablar con el LLM local del usuario.
//
// En modo Personal el servidor corre en la máquina del propio usuario (embebido
// en Electron) y la config del LLM llega desde el cliente (localStorage). Para
// que un eventual despliegue web NO se convierta en un SSRF, solo permitimos
// destinos de loopback: LM Studio / Ollama / vLLM corriendo en localhost.

const LOOPBACK_NAMES = new Set(['localhost', '::1', '[::1]', '0.0.0.0']);

export class LocalUrlError extends Error {
  constructor(readonly code: 'bad_url' | 'bad_protocol' | 'not_local') {
    super(code);
    this.name = 'LocalUrlError';
  }
}

/** ¿`host` es un literal IPv4 dentro de 127.0.0.0/8? (no un nombre tipo "127.0.0.1.evil.com"). */
function isLoopbackIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const octets = m.slice(1).map(Number);
  if (octets.some((n) => n > 255)) return false;
  return octets[0] === 127;
}

/**
 * Valida que `raw` apunte a un host local y devuelve la base normalizada
 * (sin barra final). Lanza `LocalUrlError` si no es seguro.
 *
 * Estricto a propósito: solo nombres de loopback conocidos o un literal IPv4
 * 127.0.0.0/8. Nada de prefijos (evita bypass tipo "127.0.0.1.evil.com").
 */
export function assertLocalBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LocalUrlError('bad_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new LocalUrlError('bad_protocol');
  }
  const host = url.hostname.toLowerCase();
  if (!LOOPBACK_NAMES.has(host) && !isLoopbackIPv4(host)) {
    throw new LocalUrlError('not_local');
  }
  return `${url.origin}${url.pathname}`.replace(/\/$/, '');
}

/** fetch con timeout (los modelos locales pueden tardar; sin timeout no degradan). */
export function fetchWithTimeout(ms: number): typeof fetch {
  return async (input, init) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(input, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };
}
