import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createLLMProvider, WorklogSuggestionService, type LLMProviderResolved } from '@pulso/llm';
import { CLOUD_HOSTS, assertLocalBaseUrl, fetchWithTimeout, LocalUrlError } from '@/lib/personal/ai-endpoint';
import { rateLimit } from '@/lib/rate-limit';

const LIMIT = Number(process.env.WORKLOG_RATE_LIMIT ?? 20);
const WINDOW_MS = Number(process.env.WORKLOG_RATE_WINDOW_MS ?? 60_000);
const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 2_000_000;
const IMAGE_DATA_URL = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/=\r\n]+)$/i;

const MAX_PROJECT_CONTEXT = 4000; // tope defensivo; el servicio recorta al presupuesto real

interface SuggestBody {
  note?: unknown;
  task?: { title?: unknown };
  projectContext?: unknown;
  attachmentsHint?: unknown;
  image?: unknown;
  images?: unknown;
  provider?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  apiKey?: unknown;
}

interface SuggestImage {
  dataUrl: string;
  mediaType: string;
}

/**
 * Resuelve el provider del LLM según lo que mandó el cliente.
 *
 * - Cloud (openai/anthropic): el baseUrl lo FUERZA el server (host hardcodeado).
 *   Aunque viaje una API key, no puede filtrarse a un host arbitrario (no SSRF).
 *   Requiere apiKey.
 * - Local (lmstudio/ollama/custom/otros): baseUrl del cliente, validado a loopback.
 */
function resolveProvider(
  providerName: string,
  rawUrl: string,
  model: string,
  apiKey: string,
): LLMProviderResolved {
  const fetchImpl = fetchWithTimeout(120_000);
  if (providerName === 'openai') {
    if (!apiKey) throw new LocalUrlError('bad_url');
    return { type: 'OPENAI_COMPATIBLE', baseUrl: `https://${CLOUD_HOSTS.openai}/v1`, model, apiKey, fetchImpl };
  }
  if (providerName === 'anthropic') {
    if (!apiKey) throw new LocalUrlError('bad_url');
    return { type: 'ANTHROPIC', baseUrl: `https://${CLOUD_HOSTS.anthropic}`, model, apiKey, fetchImpl };
  }
  return { type: 'OPENAI_COMPATIBLE', baseUrl: assertLocalBaseUrl(rawUrl), model, fetchImpl };
}

/**
 * POST /api/personal/suggest
 *
 * Genera un borrador de bitácora con el proveedor que el usuario configuró en
 * modo Personal: IA local (LM Studio / Ollama) o cloud BYOK (OpenAI / Anthropic).
 * La config viaja desde el cliente (vive en localStorage, no en el servidor) y
 * la API key nunca se persiste ni se devuelve. La IA NUNCA publica: es borrador.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limit = rateLimit('personal-suggest', { limit: LIMIT, windowMs: WINDOW_MS });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(Math.ceil((limit.retryAfterMs ?? 0) / 1000)) } },
    );
  }

  const body = (await req.json().catch(() => null)) as SuggestBody | null;
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  const model = typeof body?.model === 'string' ? body.model : '';
  const providerName = typeof body?.provider === 'string' ? body.provider : '';
  const rawUrl = typeof body?.baseUrl === 'string' ? body.baseUrl : '';
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey : '';
  if (!note || note.length > 500 || !model) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const title = typeof body?.task?.title === 'string' ? body.task.title : undefined;
  const projectContext = typeof body?.projectContext === 'string' ? body.projectContext.slice(0, MAX_PROJECT_CONTEXT) : undefined;
  const attachmentsHint = Array.isArray(body?.attachmentsHint)
    ? body.attachmentsHint.filter((a): a is string => typeof a === 'string').slice(0, 5)
    : undefined;
  let images: SuggestImage[] | undefined;
  try {
    images = parseImages(body?.images ?? body?.image);
  } catch {
    return NextResponse.json({ error: 'invalid_image' }, { status: 400 });
  }

  let resolved: LLMProviderResolved;
  try {
    resolved = resolveProvider(providerName, rawUrl, model, apiKey);
  } catch (e) {
    return NextResponse.json({ error: e instanceof LocalUrlError ? e.code : 'bad_url' }, { status: 400 });
  }

  try {
    const suggestion = await new WorklogSuggestionService(createLLMProvider(resolved)).suggest({
      note,
      task: title ? { title } : undefined,
      projectContext,
      attachmentsHint,
      images,
    });
    return NextResponse.json({ status: 'DRAFT', suggestion });
  } catch {
    return NextResponse.json({ error: 'llm_unavailable' }, { status: 502 });
  }
}

function parseImages(input: unknown): SuggestImage[] | undefined {
  const rawImages = Array.isArray(input) ? input : input ? [input] : [];
  if (rawImages.length === 0) return undefined;

  return rawImages.slice(0, MAX_IMAGES).map((raw) => {
    const dataUrl =
      typeof raw === 'string'
        ? raw
        : typeof raw === 'object' && raw !== null && 'dataUrl' in raw && typeof raw.dataUrl === 'string'
          ? raw.dataUrl
          : '';
    if (dataUrl.length === 0 || dataUrl.length > MAX_IMAGE_CHARS) throw new Error('invalid_image');

    const match = dataUrl.match(IMAGE_DATA_URL);
    if (!match?.[1]) throw new Error('invalid_image');
    return {
      dataUrl,
      mediaType: match[1].toLowerCase().replace('image/jpg', 'image/jpeg'),
    };
  });
}
