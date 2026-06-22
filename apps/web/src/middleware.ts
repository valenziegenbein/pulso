import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/constants';

/**
 * Guard de rutas: si no hay cookie de sesión, redirige a /login.
 * La verificación criptográfica real ocurre en el servidor (getAuthContext);
 * el middleware solo hace el chequeo barato de presencia.
 */
export function middleware(req: NextRequest): NextResponse {
  if (!req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Excluidos del guard de auth:
  // - /widget: maneja su propio estado "sin sesión".
  // - /welcome y /personal: modo personal local-first (sin cuenta).
  matcher: ['/((?!login|widget|welcome|personal|captura|api|_next/static|_next/image|favicon.ico).*)'],
};
