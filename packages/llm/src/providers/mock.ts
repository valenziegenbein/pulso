import { messageContentText, type CompletionRequest, type CompletionResult, type LLMProvider } from '../provider';

/**
 * Proveedor de desarrollo/tests: no usa red ni API key.
 * Devuelve una sugerencia determinística en el mismo formato JSON que se le
 * pide a un LLM real, derivada de la micro-nota del usuario.
 */
export class MockProvider implements LLMProvider {
  readonly id = 'mock';

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const userMsg = [...request.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const userText = messageContentText(userMsg);
    const note = extractNote(userText);
    const lower = note.toLowerCase();

    const type = lower.includes('bloque')
      ? 'BLOCKER'
      : /investig|revis|evalu|explor/.test(lower)
        ? 'RESEARCH'
        : /decid|defin/.test(lower)
          ? 'DECISION'
          : 'PROGRESS';

    const suggestion = {
      type,
      title: capitalize(note).slice(0, 80) || 'Actualización de trabajo',
      content:
        `Estoy trabajando en: ${note}. ` +
        `Esta entrada fue generada en modo MOCK a partir de la nota. ` +
        `Editá o ajustá el contenido antes de aprobar.`,
    };

    return { text: JSON.stringify(suggestion), model: 'mock-1' };
  }

  /** Embeddings determinísticos (bag-of-hashed-words), sin red: alcanza para
   *  probar ranking por similitud sin depender de un proveedor real. */
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => hashEmbed(t));
  }
}

const EMBED_DIMS = 32;

function hashEmbed(text: string): number[] {
  const vec = new Array(EMBED_DIMS).fill(0);
  const words = text.toLowerCase().match(/[a-z0-9áéíóúñ]+/gi) ?? [];
  for (const w of words) {
    let h = 0;
    for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
    vec[h % EMBED_DIMS] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function extractNote(userPrompt: string): string {
  const match = userPrompt.match(/Nota:\s*"?([^"\n]+)"?/i);
  return (match?.[1] ?? userPrompt).trim();
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
