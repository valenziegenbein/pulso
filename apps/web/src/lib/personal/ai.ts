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

export type CloudProvider = 'openai' | 'anthropic';

export interface CloudPreset {
  label: string;
  keyPlaceholder: string;
  keyUrl: string;
  /** Modelos por defecto si no se pueden listar (clave inválida, sin red). */
  fallbackModels: string[];
}

export const CLOUD_PRESETS: Record<CloudProvider, CloudPreset> = {
  openai: {
    label: 'OpenAI',
    keyPlaceholder: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
    fallbackModels: ['gpt-4o-mini', 'gpt-4o'],
  },
  anthropic: {
    label: 'Anthropic',
    keyPlaceholder: 'sk-ant-…',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    fallbackModels: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'],
  },
};

export function isCloudProvider(p: AiProvider): p is CloudProvider {
  return p === 'openai' || p === 'anthropic';
}

/** Servidores locales OpenAI-compatible que ofrece la UI. */
export type LocalProvider = Exclude<AiProvider, 'custom' | CloudProvider>;

export const PROVIDER_PRESETS: Record<LocalProvider, ProviderPreset> = {
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

export interface DraftImage {
  dataUrl: string;
  mediaType?: string;
}

export class AiError extends Error {
  constructor(readonly code: 'rate_limited' | 'unavailable' | 'network' | 'unauthorized') {
    super(code);
    this.name = 'AiError';
  }
}

/** ¿La config alcanza para generar? (cloud necesita además la API key). */
export function aiReady(ai: AiMode, config: AiConfig | null): boolean {
  if (ai === 'none' || !config?.baseUrl || !config?.model) return false;
  if (isCloudProvider(config.provider) && !config.apiKey) return false;
  return true;
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

/** Verifica la API key de un proveedor cloud y devuelve sus modelos (vía proxy server-side). */
export async function verifyCloud(provider: CloudProvider, apiKey: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch('/api/personal/ai/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, apiKey }),
    });
  } catch {
    throw new AiError('network');
  }
  if (res.status === 401) throw new AiError('unauthorized');
  if (!res.ok) throw new AiError('unavailable');
  const data = (await res.json()) as { models?: string[] };
  return data.models ?? [];
}

const ENTRY_TYPES: EntryType[] = ['PROGRESS', 'RESEARCH', 'DECISION', 'BLOCKER', 'NOTE', 'DELIVERY'];

function coerceType(value: unknown): EntryType {
  return typeof value === 'string' && ENTRY_TYPES.includes(value as EntryType) ? (value as EntryType) : 'NOTE';
}

/** Borrador manual: sin red, la persona escribe y aprueba. Con captura sola,
 *  la imagen es la entrada y el título es genérico. */
function manualDraft(note: string): DraftSuggestion {
  const trimmed = note.trim();
  if (trimmed.length === 0) return { type: 'NOTE', title: 'Captura de pantalla', content: '' };
  const firstLine = trimmed.split('\n')[0] ?? trimmed;
  return { type: 'NOTE', title: firstLine.slice(0, 80), content: trimmed };
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

/** Variante streaming (SSE): va entregando el contenido en vivo vía onDelta y
 *  resuelve con la sugerencia final. */
async function streamSuggest(url: string, body: Record<string, unknown>, onDelta: (text: string) => void): Promise<DraftSuggestion> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, stream: true }),
    });
  } catch {
    throw new AiError('network');
  }
  if (res.status === 429) throw new AiError('rate_limited');
  if (!res.ok || !res.body) throw new AiError('unavailable');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let suggestion: DraftSuggestion | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      try {
        const evt = JSON.parse(t.slice(5).trim()) as {
          delta?: string;
          done?: boolean;
          suggestion?: { type: string; title: string; content: string };
          error?: string;
        };
        if (typeof evt.delta === 'string') onDelta(evt.delta);
        if (evt.error) throw new AiError('unavailable');
        if (evt.done && evt.suggestion) {
          suggestion = {
            type: coerceType(evt.suggestion.type),
            title: evt.suggestion.title,
            content: evt.suggestion.content,
          };
        }
      } catch (e) {
        if (e instanceof AiError) throw e;
        /* línea parcial: ignorar */
      }
    }
  }
  if (!suggestion) throw new AiError('unavailable');
  return suggestion;
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
  projectContext?: string;
  /** Extractos de las notas recientes del proyecto (bóveda, opt-in, solo desktop). */
  notesContext?: string;
  attachmentsHint?: string[];
  images?: DraftImage[];
  ai: AiMode;
  config: AiConfig | null;
  /** Si se pasa y el proveedor lo soporta, el contenido llega en vivo (streaming). */
  onDelta?: (text: string) => void;
}): Promise<DraftSuggestion> {
  const { note, task, projectContext, notesContext, attachmentsHint, images, ai, config, onDelta } = params;
  if (ai === 'none') return manualDraft(note);
  if (aiReady(ai, config) && config) {
    const body = {
      note,
      task,
      projectContext,
      notesContext,
      attachmentsHint,
      images,
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
    };
    if (onDelta) {
      try {
        return await streamSuggest('/api/personal/suggest', body, onDelta);
      } catch (e) {
        if (e instanceof AiError && e.code === 'rate_limited') throw e;
        // Streaming falló a mitad de camino: reintento sin stream.
        return postSuggest('/api/personal/suggest', body);
      }
    }
    return postSuggest('/api/personal/suggest', body);
  }
  // Sin IA configurada no hay quien "lea" la captura: borrador manual.
  if (note.trim().length === 0) return manualDraft(note);
  return postSuggest('/api/worklog/suggest', { note, task, attachmentsHint });
}
