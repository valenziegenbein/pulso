import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { worklogSuggestRequestSchema } from '@pulso/shared';
import { getAuthContext } from '@/lib/auth/context';
import { getWorklogSuggestionService } from '@/lib/llm';
import { rateLimit } from '@/lib/rate-limit';

const LIMIT = Number(process.env.WORKLOG_RATE_LIMIT ?? 10);
const WINDOW_MS = Number(process.env.WORKLOG_RATE_WINDOW_MS ?? 60_000);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const limit = rateLimit(`worklog-suggest:${ctx.user.id}`, { limit: LIMIT, windowMs: WINDOW_MS });
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
    const service = await getWorklogSuggestionService(ctx.organizationId);
    const suggestion = await service.suggest(parsed.data);
    return NextResponse.json({ status: 'DRAFT', suggestion });
  } catch {
    return NextResponse.json({ error: 'llm_unavailable' }, { status: 502 });
  }
}
