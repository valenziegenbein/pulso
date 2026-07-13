// Cliente del pipeline de IA en modo Personal. Decide a dónde generar la
// bitácora según la config del usuario (cuenta Pulso, IA local, BYOK o manual).
import type { AiConfig, AiMode, AiProvider, EntryType, TaskPriority } from './store';

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

export interface PersonalTaskSuggestion extends DraftSuggestion {
  type: 'TASK';
  priority: TaskPriority;
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

type AccountAiResult<T> = { ok: true; data: T } | { ok: false; status?: number; error?: string };

type PersonalAccountBridge = {
  isDesktop?: boolean;
  accountAiRequest?: (payload: Record<string, unknown>) => Promise<AccountAiResult<unknown>>;
  loadPersonalAiKey?: (provider: CloudProvider) => Promise<string | null>;
};

function personalAccountBridge(): PersonalAccountBridge | undefined {
  return typeof window !== 'undefined'
    ? (window as unknown as { pulso?: PersonalAccountBridge }).pulso
    : undefined;
}

async function requestAccountAi<T>(payload: Record<string, unknown>): Promise<T> {
  const bridge = personalAccountBridge();
  if (!bridge?.isDesktop || !bridge.accountAiRequest) throw new AiError('unavailable');
  let result: AccountAiResult<unknown>;
  try {
    result = await bridge.accountAiRequest(payload);
  } catch {
    throw new AiError('network');
  }
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) throw new AiError('unauthorized');
    if (result.status === 429) throw new AiError('rate_limited');
    throw new AiError(result.status ? 'unavailable' : 'network');
  }
  return result.data as T;
}

async function apiKeyFor(config: AiConfig): Promise<string | undefined> {
  if (!isCloudProvider(config.provider)) return undefined;
  const key = await personalAccountBridge()?.loadPersonalAiKey?.(config.provider);
  if (!key) throw new AiError('unauthorized');
  return key;
}

/** ¿La config alcanza para generar? (cloud necesita además la API key). */
export function aiReady(ai: AiMode, config: AiConfig | null): boolean {
  if (ai === 'account') return Boolean(personalAccountBridge()?.accountAiRequest);
  if (ai === 'none' || !config?.baseUrl || !config?.model) return false;
  if (isCloudProvider(config.provider) && !config.hasApiKey) return false;
  return true;
}

/** OpenAI: modelo de embeddings fijo (no hace falta elegirlo, es el estándar). */
export const OPENAI_EMBEDDINGS_MODEL = 'text-embedding-3-small';

/**
 * ¿Hay proveedor+modelo para embeddings? Anthropic no ofrece embeddings — el
 * asistente de notas cae a búsqueda léxica (BM25) con ese proveedor. OpenAI
 * siempre puede (modelo fijo); local necesita que el usuario haya elegido uno.
 */
export function embeddingsReady(ai: AiMode, config: AiConfig | null): boolean {
  if (!aiReady(ai, config) || !config) return false;
  if (config.provider === 'anthropic') return false;
  if (config.provider === 'openai') return true;
  return Boolean(config.embeddingsModel?.trim());
}

/** El modelo de embeddings efectivo según el proveedor (fijo en OpenAI). */
export function embeddingsModelFor(config: AiConfig): string | undefined {
  return config.provider === 'openai' ? OPENAI_EMBEDDINGS_MODEL : config.embeddingsModel;
}

/** Vectoriza textos vía el proxy server-side (mismo modelo de confianza que
 *  generateDraft: la config viaja del cliente, el server nunca la persiste). */
export async function embedTexts(texts: string[], config: AiConfig): Promise<number[][]> {
  const model = embeddingsModelFor(config);
  if (!model || texts.length === 0) return [];
  let res: Response;
  try {
    const apiKey = await apiKeyFor(config);
    res = await fetch('/api/personal/embeddings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts, provider: config.provider, baseUrl: config.baseUrl, model, apiKey }),
    });
  } catch {
    throw new AiError('network');
  }
  if (res.status === 429) throw new AiError('rate_limited');
  if (!res.ok) throw new AiError('unavailable');
  const data = (await res.json()) as { vectors?: number[][] };
  return data.vectors ?? [];
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

const ENTRY_TYPES: EntryType[] = ['PROGRESS', 'RESEARCH', 'DECISION', 'BLOCKER', 'NOTE', 'DELIVERY', 'TASK'];

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
  if (ai === 'account') {
    const data = await requestAccountAi<{ suggestion?: DraftSuggestion }>({
      operation: 'draft',
      note,
      task,
      projectContext,
      notesContext,
      attachmentsHint,
      images,
    });
    if (!data.suggestion) throw new AiError('unavailable');
    return {
      type: coerceType(data.suggestion.type),
      title: data.suggestion.title,
      content: data.suggestion.content,
    };
  }
  if (aiReady(ai, config) && config) {
    const apiKey = await apiKeyFor(config);
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
      apiKey,
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

function fallbackPersonalTask(instruction: string): PersonalTaskSuggestion {
  const clean = instruction.trim().replace(/[.!?]+$/g, '');
  const title = clean.length > 90 ? `${clean.slice(0, 87).trim()}...` : clean;
  return {
    type: 'TASK',
    title: title || 'Nueva tarea',
    content: clean || 'Definir el próximo paso y el resultado esperado.',
    priority: /urgente|bloque|riesgo|crit/i.test(clean) ? 'high' : 'medium',
  };
}

/** Convierte una instrucción breve del widget en una tarea personal estructurada. */
export async function generatePersonalTask(params: {
  instruction: string;
  project: { name: string; context?: string };
  activeTasks: Array<{ title: string; priority: TaskPriority }>;
  ai: AiMode;
  config: AiConfig | null;
}): Promise<PersonalTaskSuggestion> {
  const { instruction, project, activeTasks, ai, config } = params;
  if (ai === 'account') {
    const data = await requestAccountAi<{ suggestion?: PersonalTaskSuggestion }>({
      operation: 'task',
      instruction,
      project,
      activeTasks,
    });
    return data.suggestion ?? fallbackPersonalTask(instruction);
  }
  if (!aiReady(ai, config) || !config) return fallbackPersonalTask(instruction);

  let res: Response;
  try {
    const apiKey = await apiKeyFor(config);
    res = await fetch('/api/personal/tasks/suggest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        instruction,
        project,
        activeTasks,
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey,
      }),
    });
  } catch {
    throw new AiError('network');
  }
  if (res.status === 429) throw new AiError('rate_limited');
  if (!res.ok) throw new AiError('unavailable');
  const data = (await res.json()) as { suggestion?: PersonalTaskSuggestion };
  return data.suggestion ?? fallbackPersonalTask(instruction);
}
