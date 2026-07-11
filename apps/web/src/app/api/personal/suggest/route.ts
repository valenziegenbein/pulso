import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createLLMProvider, WorklogSuggestionService, type LLMProviderResolved } from '@pulso/llm';
import { LocalUrlError, resolveProvider } from '@/lib/personal/resolve-provider';
import { rateLimit } from '@/lib/rate-limit';
import { isPersonalApiEnabled } from '@/lib/deployment-features';
import { PayloadTooLargeError, readJsonBody } from '@/server/http';

const LIMIT = Number(process.env.WORKLOG_RATE_LIMIT ?? 20);
const WINDOW_MS = Number(process.env.WORKLOG_RATE_WINDOW_MS ?? 60_000);
const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 2_000_000;
const IMAGE_DATA_URL = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/=\r\n]+)$/i;

const MAX_PROJECT_CONTEXT = 4000; // tope defensivo; el servicio recorta al presupuesto real
const MAX_NOTES_CONTEXT = 8000; // ídem: extractos de la bóveda (opt-in)

interface SuggestBody {
  note?: unknown;
  task?: { title?: unknown };
  projectContext?: unknown;
  notesContext?: unknown;
  attachmentsHint?: unknown;
  image?: unknown;
  images?: unknown;
  provider?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  apiKey?: unknown;
  stream?: unknown;
}

interface SuggestImage {
  dataUrl: string;
  mediaType: string;
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
  if (!isPersonalApiEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const limit = rateLimit('personal-suggest', { limit: LIMIT, windowMs: WINDOW_MS });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(Math.ceil((limit.retryAfterMs ?? 0) / 1000)) } },
    );
  }

  let body: SuggestBody | null;
  try {
    body = (await readJsonBody(req, 7_000_000)) as SuggestBody | null;
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    throw error;
  }
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  const model = typeof body?.model === 'string' ? body.model : '';
  const providerName = typeof body?.provider === 'string' ? body.provider : '';
  const rawUrl = typeof body?.baseUrl === 'string' ? body.baseUrl : '';
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey : '';
  let images: SuggestImage[] | undefined;
  try {
    images = parseImages(body?.images ?? body?.image);
  } catch {
    return NextResponse.json({ error: 'invalid_image' }, { status: 400 });
  }
  // La nota es opcional cuando hay captura: la imagen sola alcanza como contexto.
  if ((!note && !images?.length) || note.length > 500 || !model) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const title = typeof body?.task?.title === 'string' ? body.task.title : undefined;
  const projectContext = typeof body?.projectContext === 'string' ? body.projectContext.slice(0, MAX_PROJECT_CONTEXT) : undefined;
  const notesContext = typeof body?.notesContext === 'string' ? body.notesContext.slice(0, MAX_NOTES_CONTEXT) : undefined;
  const attachmentsHint = Array.isArray(body?.attachmentsHint)
    ? body.attachmentsHint.filter((a): a is string => typeof a === 'string').slice(0, 5)
    : undefined;

  let resolved: LLMProviderResolved;
  try {
    resolved = resolveProvider(providerName, rawUrl, model, apiKey);
  } catch (e) {
    return NextResponse.json({ error: e instanceof LocalUrlError ? e.code : 'bad_url' }, { status: 400 });
  }

  const service = new WorklogSuggestionService(createLLMProvider(resolved));
  const input = {
    note,
    task: title ? { title } : undefined,
    projectContext,
    notesContext,
    attachmentsHint,
    images,
  };

  // Streaming (SSE): el borrador aparece a medida que el modelo lo escribe.
  // Eventos: {delta} … {done, suggestion} | {error}. Si el proveedor no
  // soporta stream, el service degrada solo y llega directo el `done`.
  if (body?.stream === true) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        try {
          const suggestion = await service.suggestStream(input, (delta) => send({ delta }));
          send({ done: true, suggestion });
        } catch {
          send({ error: 'llm_unavailable' });
        }
        controller.close();
      },
    });
    return new NextResponse(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    });
  }

  try {
    const suggestion = await service.suggest(input);
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
