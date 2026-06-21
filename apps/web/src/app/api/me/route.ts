import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/context';

/** Chequeo liviano de sesión. Lo usa el widget para auto-sincronizarse cuando
 *  el usuario inicia sesión en la ventana principal (la cookie es compartida). */
export async function GET(): Promise<NextResponse> {
  const ctx = await getAuthContext();
  return NextResponse.json({ authed: Boolean(ctx) });
}
