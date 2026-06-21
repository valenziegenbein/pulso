import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { worklogSuggestRequestSchema } from '@pulso/shared';
import { getWorklogSuggestionService } from '@/lib/llm';
import { rateLimit } from '@/lib/rate-limit';

const LIMIT = Number(process.env.WORKLOG_RATE_LIMIT ?? 10);
const WINDOW_MS = Number(process.env.WORKLOG_RATE_WINDOW_MS ?? 60_000);

/**
 * POST /api/worklog/suggest
 *
 * Convierte una micro-nota en una SUGERENCIA de bitácora (borrador).
 * La IA nunca persiste ni publica: el humano decide en un paso posterior.
 * Nunca devuelve la API key del proveedor.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // TODO(auth): reemplazar por la sesión real (Auth.js). MVP: header de dev.
  const userId = req.headers.get('x-user-id') ?? 'dev-user';

  const limit = rateLimit(`worklog-suggest:${userId}`, { limit: LIMIT, windowMs: WINDOW_MS });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(Math.ceil((limit.retryAfterMs ?? 0) / 1000)) } },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = worklogSuggestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const suggestion = await getWorklogSuggestionService().suggest(parsed.data);
    return NextResponse.json({ status: 'DRAFT', suggestion });
  } catch {
    return NextResponse.json({ error: 'llm_unavailable' }, { status: 502 });
  }
}
