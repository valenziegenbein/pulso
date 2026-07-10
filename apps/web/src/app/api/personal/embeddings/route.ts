import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createLLMProvider, type LLMProviderResolved } from '@pulso/llm';
import { LocalUrlError, resolveProvider } from '@/lib/personal/resolve-provider';
import { rateLimit } from '@/lib/rate-limit';

const LIMIT = Number(process.env.EMBEDDINGS_RATE_LIMIT ?? 30);
const WINDOW_MS = Number(process.env.EMBEDDINGS_RATE_WINDOW_MS ?? 60_000);
const MAX_TEXTS = 64;
const MAX_TEXT_CHARS = 4000;

interface EmbeddingsBody {
  texts?: unknown;
  provider?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  apiKey?: unknown;
}

/**
 * POST /api/personal/embeddings
 *
 * Vectoriza texto para el asistente de notas (etapa 2b: retrieval semántico).
 * Mismo modelo de confianza que /api/personal/suggest: la config del proveedor
 * viaja del cliente (localStorage), el server SOLO fuerza los hosts cloud y
 * valida loopback para local — nunca persiste texto ni vectores.
 *
 * Si el proveedor no soporta embeddings (Anthropic, o Mock en tests), 400.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limit = rateLimit('personal-embeddings', { limit: LIMIT, windowMs: WINDOW_MS });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(Math.ceil((limit.retryAfterMs ?? 0) / 1000)) } },
    );
  }

  const body = (await req.json().catch(() => null)) as EmbeddingsBody | null;
  const texts = Array.isArray(body?.texts) ? body.texts.filter((t): t is string => typeof t === 'string') : [];
  const model = typeof body?.model === 'string' ? body.model : '';
  const providerName = typeof body?.provider === 'string' ? body.provider : '';
  const rawUrl = typeof body?.baseUrl === 'string' ? body.baseUrl : '';
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey : '';

  if (texts.length === 0 || texts.length > MAX_TEXTS || !model) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  if (texts.some((t) => t.length === 0 || t.length > MAX_TEXT_CHARS)) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  let resolved: LLMProviderResolved;
  try {
    resolved = resolveProvider(providerName, rawUrl, model, apiKey, 30_000);
  } catch (e) {
    return NextResponse.json({ error: e instanceof LocalUrlError ? e.code : 'bad_url' }, { status: 400 });
  }

  const provider = createLLMProvider(resolved);
  if (!provider.embed) {
    return NextResponse.json({ error: 'embeddings_unsupported' }, { status: 400 });
  }

  try {
    const vectors = await provider.embed(texts);
    return NextResponse.json({ vectors });
  } catch {
    return NextResponse.json({ error: 'llm_unavailable' }, { status: 502 });
  }
}
