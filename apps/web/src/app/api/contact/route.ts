import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { PayloadTooLargeError, readJsonBody } from '@/server/http';
import { contactRateLimitKey, enqueueContactRequest, isAllowedContactOrigin, parseContactRequest } from '@/server/contact';
import { getRequestId, logServer } from '@/server/logging';

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  if (!isAllowedContactOrigin(request.headers.get('origin'), process.env.PULSO_MARKETING_ORIGIN, process.env.NODE_ENV === 'production')) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await readJsonBody(request, 16 * 1024);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const input = parseContactRequest(body);
  if (!input) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  if (input.website) return NextResponse.json({ ok: true }, { status: 202 });
  const limit = rateLimit(`contact:${contactRateLimitKey(input)}`, { limit: 3, windowMs: 60 * 60_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: 'rate_limited' }, {
      status: 429,
      headers: { 'retry-after': String(Math.max(1, Math.ceil((limit.retryAfterMs ?? 60_000) / 1000))) },
    });
  }
  try {
    await enqueueContactRequest(input);
    logServer('info', 'contact_request_queued', { requestId, metadata: { topic: input.topic } });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    logServer('error', 'contact_request_failed', { requestId, error });
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
