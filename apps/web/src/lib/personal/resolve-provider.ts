// SERVER-ONLY. Resuelve el provider LLM que mandó el cliente (config vive en
// localStorage, no en el server) a un LLMProviderResolved seguro.
//
// Compartido por /api/personal/suggest y /api/personal/embeddings — la lógica
// SSRF-sensible (host cloud forzado, validación de loopback) vive en un solo
// lugar para no duplicar código de seguridad entre rutas.
import type { LLMProviderResolved } from '@pulso/llm';
import { CLOUD_HOSTS, assertLocalBaseUrl, fetchWithTimeout, LocalUrlError } from './ai-endpoint';

/**
 * - Cloud (openai/anthropic): el baseUrl lo FUERZA el server (host hardcodeado).
 *   Aunque viaje una API key, no puede filtrarse a un host arbitrario (no SSRF).
 *   Requiere apiKey.
 * - Local (lmstudio/ollama/custom/otros): baseUrl del cliente, validado a loopback.
 */
export function resolveProvider(
  providerName: string,
  rawUrl: string,
  model: string,
  apiKey: string,
  timeoutMs = 120_000,
): LLMProviderResolved {
  const fetchImpl = fetchWithTimeout(timeoutMs);
  if (providerName === 'openai') {
    if (!apiKey) throw new LocalUrlError('bad_url');
    return { type: 'OPENAI_COMPATIBLE', baseUrl: `https://${CLOUD_HOSTS.openai}/v1`, model, apiKey, fetchImpl };
  }
  if (providerName === 'anthropic') {
    if (!apiKey) throw new LocalUrlError('bad_url');
    return { type: 'ANTHROPIC', baseUrl: `https://${CLOUD_HOSTS.anthropic}`, model, apiKey, fetchImpl };
  }
  return { type: 'OPENAI_COMPATIBLE', baseUrl: assertLocalBaseUrl(rawUrl), model, fetchImpl };
}

export { LocalUrlError };
