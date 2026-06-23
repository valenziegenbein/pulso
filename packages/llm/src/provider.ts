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
