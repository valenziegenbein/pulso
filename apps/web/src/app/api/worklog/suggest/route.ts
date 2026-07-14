import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { worklogSuggestRequestSchema } from '@pulso/shared';
import { getAuthContext } from '@/lib/auth/context';
import { getWorklogSuggestionService } from '@/lib/llm';
import { rateLimit } from '@/lib/rate-limit';
import { PayloadTooLargeError, readJsonBody } from '@/server/http';
import { assertTaskAccess, assertTeamAccess, isAuthorizationError } from '@/server/authz';
import { retrieveCloudKnowledge } from '@/server/knowledge';

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

  let body: unknown;
  try {
    body = await readJsonBody(req, 7_000_000);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    throw error;
  }
  const parsed = worklogSuggestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    let teamId = parsed.data.teamId;
    if (parsed.data.taskId) {
      const task = await assertTaskAccess(ctx, parsed.data.taskId);
      teamId = task.teamId;
    } else if (teamId) {
      await assertTeamAccess(ctx, teamId);
    }
    let notesContext: string | undefined;
    if (teamId) {
      try {
        notesContext = (await retrieveCloudKnowledge(ctx, {
          scope: 'TEAM', teamId, query: parsed.data.note, maxChars: 3_000,
        })) ?? undefined;
      } catch {
        // El índice documental es una mejora; no bloquea la captura cotidiana.
      }
    }
    const service = await getWorklogSuggestionService(ctx.organizationId);
    const suggestion = await service.suggest({ ...parsed.data, notesContext });
    return NextResponse.json({ status: 'DRAFT', suggestion });
  } catch (error) {
    if (isAuthorizationError(error)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ error: 'llm_unavailable' }, { status: 502 });
  }
}
