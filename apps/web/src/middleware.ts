import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/constants';

const MAX_API_BODY_BYTES = 8 * 1024 * 1024;
const PUBLIC_PATHS = ['/login', '/register', '/select-organization', '/widget', '/welcome', '/personal', '/captura'];

function requestId(req: NextRequest): string {
  const incoming = req.headers.get('x-request-id');
  return incoming && /^[a-zA-Z0-9_-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
}

function isPublic(pathname: string): boolean {
  return pathname.startsWith('/api/') || PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function middleware(req: NextRequest): NextResponse {
  const id = requestId(req);
  const length = Number(req.headers.get('content-length') ?? '0');
  if (req.nextUrl.pathname.startsWith('/api/') && Number.isFinite(length) && length > MAX_API_BODY_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413, headers: { 'x-request-id': id } });
  }

  if (!isPublic(req.nextUrl.pathname) && !req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    const response = NextResponse.redirect(url);
    response.headers.set('x-request-id', id);
    return response;
  }

  const headers = new Headers(req.headers);
  headers.set('x-request-id', id);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('x-request-id', id);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
