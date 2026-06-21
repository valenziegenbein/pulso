import {
  type CompletionRequest,
  type CompletionResult,
  type LLMProvider,
  LLMRequestError,
} from '../provider';

export interface AnthropicOptions {
  apiKey: string;
  /** Para esta tarea liviana, un modelo chico alcanza: claude-haiku-4-5-20251001. */
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const ANTHROPIC_VERSION = '2023-06-01';

/** Adapter para la API de mensajes de Anthropic. */
export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: AnthropicOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    // Anthropic separa el `system` del resto de los mensajes.
    const system = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const messages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    let res: Response;
    try {
      res = await this.fetchImpl(`${(this.opts.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.opts.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.opts.model,
          system: system || undefined,
          messages,
          max_tokens: request.maxTokens ?? 600,
          temperature: request.temperature ?? 0.3,
        }),
      });
    } catch (cause) {
      throw new LLMRequestError(`No se pudo contactar a Anthropic: ${String(cause)}`, undefined, this.id);
    }

    if (!res.ok) {
      throw new LLMRequestError(`Anthropic respondió ${res.status}`, res.status, this.id);
    }

    const data = (await res.json()) as {
      model?: string;
      content?: Array<{ type: string; text?: string }>;
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    return { text, model: data.model ?? this.opts.model };
  }
}
