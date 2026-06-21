import type { LLMProviderType } from '@pulso/shared';
import type { LLMProvider } from './provider';
import { AnthropicProvider } from './providers/anthropic';
import { MockProvider } from './providers/mock';
import { OpenAICompatibleProvider } from './providers/openai-compatible';

export * from './provider';
export * from './providers/openai-compatible';
export * from './providers/anthropic';
export * from './providers/mock';
export * from './worklog-suggestion.service';

export interface LLMProviderResolved {
  type: LLMProviderType;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  fetchImpl?: typeof fetch;
}

/**
 * Factory: elige el adapter en runtime. Punto único donde se conoce el set de
 * proveedores; el resto del sistema solo ve `LLMProvider`.
 */
export function createLLMProvider(config: LLMProviderResolved): LLMProvider {
  switch (config.type) {
    case 'OPENAI_COMPATIBLE':
      if (!config.baseUrl) throw new Error('OPENAI_COMPATIBLE requiere baseUrl');
      return new OpenAICompatibleProvider({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        fetchImpl: config.fetchImpl,
      });
    case 'ANTHROPIC':
      if (!config.apiKey) throw new Error('ANTHROPIC requiere apiKey');
      return new AnthropicProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        fetchImpl: config.fetchImpl,
      });
    case 'MOCK':
      return new MockProvider();
    default: {
      const exhaustive: never = config.type;
      throw new Error(`Proveedor LLM no soportado: ${String(exhaustive)}`);
    }
  }
}
