import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return NextResponse.json(
    { status: 'ok', service: 'pulso-web', uptimeSeconds: Math.floor(process.uptime()) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
