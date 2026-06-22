// Cliente del pipeline de IA en modo Personal. Decide a dónde generar la
// bitácora según la config del usuario (IA local, sin IA, o fallback mock).
import type { AiConfig, AiMode, AiProvider, EntryType } from './store';

export interface ProviderPreset {
  label: string;
  /** Puerto por defecto del servidor local. */
  port: number;
  /** Construye la base OpenAI-compatible a partir del puerto. */
  baseUrl: (port: number) => string;
  hint: string;
}

export const PROVIDER_PRESETS: Record<Exclude<AiProvider, 'custom'>, ProviderPreset> = {
  lmstudio: {
    label: 'LM Studio',
    port: 1234,
    baseUrl: (p) => `http://localhost:${p}/v1`,
    hint: 'Activá el servidor local en LM Studio (pestaña "Developer" / "Local Server").',
  },
  ollama: {
    label: 'Ollama',
    port: 11434,
    baseUrl: (p) => `http://localhost:${p}/v1`,
    hint: 'Asegurate de que Ollama esté corriendo (ollama serve) con un modelo descargado.',
  },
};

export interface DraftSuggestion {
  type: EntryType;
  title: string;
  content: string;
}

export class AiError extends Error {
  constructor(readonly code: 'rate_limited' | 'unavailable' | 'network') {
    super(code);
    this.name = 'AiError';
  }
}

/** ¿La config alcanza para generar con IA local? */
export function aiReady(ai: AiMode, config: AiConfig | null): boolean {
  return ai !== 'none' && Boolean(config?.baseUrl && config?.model);
}

/** Lista los modelos cargados en el servidor local (vía proxy server-side). */
export async function listModels(baseUrl: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch('/api/personal/ai/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseUrl }),
    });
  } catch {
    throw new AiError('network');
  }
  if (!res.ok) throw new AiError('unavailable');
  const data = (await res.json()) as { models?: string[] };
  return data.models ?? [];
}

const ENTRY_TYPES: EntryType[] = ['PROGRESS', 'RESEARCH', 'DECISION', 'BLOCKER', 'NOTE', 'DELIVERY'];

function coerceType(value: unknown): EntryType {
  return typeof value === 'string' && ENTRY_TYPES.includes(value as EntryType) ? (value as EntryType) : 'NOTE';
}

/** Borrador manual: sin red, la persona escribe y aprueba. */
function manualDraft(note: string): DraftSuggestion {
  const firstLine = note.trim().split('\n')[0] ?? note;
  return { type: 'NOTE', title: firstLine.slice(0, 80), content: note.trim() };
}

async function postSuggest(url: string, body: unknown): Promise<DraftSuggestion> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiError('network');
  }
  if (res.status === 429) throw new AiError('rate_limited');
  if (!res.ok) throw new AiError('unavailable');
  const data = (await res.json()) as { suggestion: { type: string; title: string; content: string } };
  return { type: coerceType(data.suggestion.type), title: data.suggestion.title, content: data.suggestion.content };
}

/**
 * Genera un borrador de bitácora según la config del usuario:
 * - `ai === 'none'`  → borrador manual, sin red.
 * - IA local lista   → /api/personal/suggest (LM Studio / Ollama del usuario).
 * - cualquier otro   → /api/worklog/suggest (mock / config del servidor).
 */
export async function generateDraft(params: {
  note: string;
  task?: { title?: string };
  attachmentsHint?: string[];
  ai: AiMode;
  config: AiConfig | null;
}): Promise<DraftSuggestion> {
  const { note, task, attachmentsHint, ai, config } = params;
  if (ai === 'none') return manualDraft(note);
  if (aiReady(ai, config) && config) {
    return postSuggest('/api/personal/suggest', { note, task, attachmentsHint, baseUrl: config.baseUrl, model: config.model });
  }
  return postSuggest('/api/worklog/suggest', { note, task, attachmentsHint });
}
