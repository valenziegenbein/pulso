import { NextResponse } from 'next/server';
import { consumeAuthRateLimit, exchangeDesktopAuthorizationCode } from '@/server/auth-service';
import { hashOpaqueToken } from '@/lib/auth/session';

export async function POST(request: Request) {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(length) && length > 8192) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const code = typeof body.code === 'string' ? body.code : '';
  const codeVerifier = typeof body.codeVerifier === 'string' ? body.codeVerifier : '';
  const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri : '';
  const deviceName = typeof body.deviceName === 'string' ? body.deviceName : null;
  if (!code || !await consumeAuthRateLimit('DESKTOP_TOKEN', hashOpaqueToken(code), 10, 15 * 60_000, 15 * 60_000)) {
    return NextResponse.json({ error: 'invalid_grant' }, { status: 400, headers: { 'cache-control': 'no-store' } });
  }
  const token = await exchangeDesktopAuthorizationCode({ code, codeVerifier, redirectUri, deviceName });
  return token
    ? NextResponse.json({ accessToken: token, tokenType: 'Bearer' }, { headers: { 'cache-control': 'no-store' } })
    : NextResponse.json({ error: 'invalid_grant' }, { status: 400, headers: { 'cache-control': 'no-store' } });
}
