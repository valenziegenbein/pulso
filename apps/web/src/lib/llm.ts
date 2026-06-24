// SERVER-ONLY. No importar desde componentes cliente: la API key vive en el
// servidor y nunca debe llegar al bundle del navegador.
import {
  createLLMProvider,
  TaskSuggestionService,
  WorklogSuggestionService,
  type LLMProvider,
  type LLMProviderResolved,
} from '@pulso/llm';
import type { LLMProviderType } from '@pulso/shared';

function resolveConfigFromEnv(): LLMProviderResolved {
  const type = (process.env.LLM_PROVIDER ?? 'MOCK') as LLMProviderType;
  return {
    type,
    baseUrl: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL ?? 'mock-1',
  };
}

/**
 * Devuelve el servicio de sugerencias configurado.
 *
 * En producción, la configuración se carga por organización desde la base
 * (`LLMProviderConfig`) y la API key se descifra acá, en el servidor. Para el
 * MVP usamos variables de entorno (por defecto MOCK, sin red ni key).
 */
export function getWorklogSuggestionService(): WorklogSuggestionService {
  return new WorklogSuggestionService(createLLMProvider(resolveConfigFromEnv()));
}

export function getTaskSuggestionService(): TaskSuggestionService {
  return new TaskSuggestionService(createLLMProvider(resolveConfigFromEnv()));
}

/**
 * Provider crudo para tareas de texto libre (p.ej. el "pulso" del equipo).
 * `isReal` indica si hay un proveedor configurado de verdad (no MOCK): cuando es
 * falso, el caller debe usar su propio resumen heurístico.
 */
export function getConfiguredProvider(): { provider: LLMProvider; isReal: boolean } {
  const config = resolveConfigFromEnv();
  return { provider: createLLMProvider(config), isReal: config.type !== 'MOCK' };
}
