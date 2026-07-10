/**
 * Contrato común a todos los proveedores LLM (patrón Strategy/Adapter).
 *
 * El resto del sistema depende SOLO de esta interfaz. Ningún proveedor está
 * hardcodeado: se elige en runtime vía `createLLMProvider` (factory).
 */

export interface ChatTextContentPart {
  type: 'text';
  text: string;
}

export interface ChatImageContentPart {
  type: 'image';
  dataUrl: string;
  mediaType?: string;
  detail?: 'auto' | 'low' | 'high';
}

export type ChatContentPart = ChatTextContentPart | ChatImageContentPart;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

export interface CompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
}

export interface LLMProvider {
  /** Identificador del adapter (para logs y trazabilidad). */
  readonly id: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
  /**
   * Streaming opcional: emite deltas de texto a medida que el modelo escribe y
   * resuelve con el resultado completo. Si el adapter no lo implementa, el
   * caller degrada a `complete()`.
   */
  completeStream?(request: CompletionRequest, onDelta: (text: string) => void): Promise<CompletionResult>;
  /**
   * Embeddings opcionales: vectoriza cada texto (mismo orden de entrada/salida).
   * Solo lo implementan los adapters con endpoint de embeddings (OpenAI-compatible).
   * Anthropic no ofrece embeddings, así que su adapter no define este método —
   * el caller debe tratar la ausencia como "no soportado", no como error.
   */
  embed?(texts: string[]): Promise<number[][]>;
}

/**
 * Recorre un body SSE (`text/event-stream`) invocando `handle` por cada línea
 * `data: …`. Compartido por los adapters que soportan streaming.
 */
export async function forEachSseData(res: Response, handle: (data: string) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('Respuesta de streaming sin body');
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('data:')) handle(t.slice(5).trim());
    }
  }
}

export function messageContentText(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .filter((part): part is ChatTextContentPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

export class LLMRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly providerId?: string,
  ) {
    super(message);
    this.name = 'LLMRequestError';
  }
}
