import {
  type CompletionRequest,
  type CompletionResult,
  type LLMProvider,
  LLMRequestError,
} from '../provider';

export interface OpenAICompatibleOptions {
  /** Ej: https://api.openai.com/v1  |  http://localhost:11434/v1 (Ollama)  |  LM Studio / vLLM */
  baseUrl: string;
  /** Opcional: vacío en servidores locales. */
  apiKey?: string;
  model: string;
  /** Inyectable para tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Cubre OpenAI y cualquier servidor con API compatible (Ollama, LM Studio,
 * vLLM, servidor propio). La diferencia local vs nube es solo `baseUrl`.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly id = 'openai-compatible';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: OpenAICompatibleOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.opts.apiKey ? { authorization: `Bearer ${this.opts.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.opts.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.3,
          max_tokens: request.maxTokens ?? 600,
        }),
      });
    } catch (cause) {
      throw new LLMRequestError(`No se pudo contactar al proveedor: ${String(cause)}`, undefined, this.id);
    }

    if (!res.ok) {
      throw new LLMRequestError(`Proveedor respondió ${res.status}`, res.status, this.id);
    }

    const data = (await res.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      model: data.model ?? this.opts.model,
    };
  }
}
