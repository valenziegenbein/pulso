import type { CompletionRequest, CompletionResult, LLMProvider } from '../provider';

/**
 * Proveedor de desarrollo/tests: no usa red ni API key.
 * Devuelve una sugerencia determinística en el mismo formato JSON que se le
 * pide a un LLM real, derivada de la micro-nota del usuario.
 */
export class MockProvider implements LLMProvider {
  readonly id = 'mock';

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const userMsg = [...request.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const note = extractNote(userMsg);
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
}

function extractNote(userPrompt: string): string {
  const match = userPrompt.match(/Nota:\s*"?([^"\n]+)"?/i);
  return (match?.[1] ?? userPrompt).trim();
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
