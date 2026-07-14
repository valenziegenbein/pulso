import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/context';
import { rateLimit } from '@/lib/rate-limit';
import { PayloadTooLargeError, readJsonBody } from '@/server/http';
import { KnowledgeInputError, syncKnowledgeBatch, type KnowledgeSyncInput } from '@/server/knowledge';
import { getPersonalAccountAiAccess, isPersonalAccountAiEnabled } from '@/server/personal-account-ai';

export async function POST(req: Request): Promise<NextResponse> {
  if (!isPersonalAccountAiEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  const access = await getPersonalAccountAiAccess();
  if (!access.enabled) return NextResponse.json({ error: access.reason }, { status: access.authenticated ? 403 : 401 });

  const limit = rateLimit(`knowledge-sync:${ctx.user.id}`, {
    limit: Number(process.env.PULSO_KNOWLEDGE_SYNC_RATE_LIMIT ?? 120),
    windowMs: Number(process.env.PULSO_KNOWLEDGE_SYNC_RATE_WINDOW_MS ?? 60_000),
  });
  if (!limit.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  let body: KnowledgeSyncInput;
  try {
    body = await readJsonBody(req, 256 * 1024) as KnowledgeSyncInput;
    return NextResponse.json(await syncKnowledgeBatch(ctx, body));
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    if (error instanceof KnowledgeInputError) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    throw error;
  }
}
