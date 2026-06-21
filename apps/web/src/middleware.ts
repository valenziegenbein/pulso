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
  // /widget se excluye: maneja su propio estado "sin sesión" (cartel compacto),
  // así la ventana flotante nunca muestra el /login ni el panel completos.
  matcher: ['/((?!login|widget|api|_next/static|_next/image|favicon.ico).*)'],
};
