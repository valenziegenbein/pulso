import { NextResponse } from 'next/server';
import { verifyEmailToken } from '@/server/auth-service';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const verified = await verifyEmailToken(url.searchParams.get('token') ?? '');
  const destination = new URL('/login', url.origin);
  destination.searchParams.set('verified', verified ? '1' : '0');
  return NextResponse.redirect(destination, 303);
}
