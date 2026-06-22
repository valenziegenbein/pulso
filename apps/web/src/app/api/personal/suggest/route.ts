import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createLLMProvider, WorklogSuggestionService } from '@pulso/llm';
import { assertLocalBaseUrl, fetchWithTimeout, LocalUrlError } from '@/lib/personal/ai-endpoint';
import { rateLimit } from '@/lib/rate-limit';

const LIMIT = Number(process.env.WORKLOG_RATE_LIMIT ?? 20);
const WINDOW_MS = Number(process.env.WORKLOG_RATE_WINDOW_MS ?? 60_000);

interface SuggestBody {
  note?: unknown;
  task?: { title?: unknown };
  attachmentsHint?: unknown;
  baseUrl?: unknown;
  model?: unknown;
}

/**
 * POST /api/personal/suggest
 *
 * Igual que /api/worklog/suggest, pero usando el LLM LOCAL que el usuario
 * configuró en modo Personal (LM Studio / Ollama). La config viaja desde el
 * cliente (vive en localStorage, no en el servidor). Solo aceptamos destinos
 * de loopback (ver assertLocalBaseUrl). La IA NUNCA persiste: devuelve borrador.
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
  const rawUrl = typeof body?.baseUrl === 'string' ? body.baseUrl : '';
  if (!note || note.length > 500 || !model || !rawUrl) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const title = typeof body?.task?.title === 'string' ? body.task.title : undefined;
  const attachmentsHint = Array.isArray(body?.attachmentsHint)
    ? body.attachmentsHint.filter((a): a is string => typeof a === 'string').slice(0, 5)
    : undefined;

  let baseUrl: string;
  try {
    baseUrl = assertLocalBaseUrl(rawUrl);
  } catch (e) {
    return NextResponse.json({ error: e instanceof LocalUrlError ? e.code : 'bad_url' }, { status: 400 });
  }

  try {
    const provider = createLLMProvider({
      type: 'OPENAI_COMPATIBLE',
      baseUrl,
      model,
      fetchImpl: fetchWithTimeout(120_000),
    });
    const suggestion = await new WorklogSuggestionService(provider).suggest({
      note,
      task: title ? { title } : undefined,
      attachmentsHint,
    });
    return NextResponse.json({ status: 'DRAFT', suggestion });
  } catch {
    return NextResponse.json({ error: 'llm_unavailable' }, { status: 502 });
  }
}
