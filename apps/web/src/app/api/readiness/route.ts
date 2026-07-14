import { NextResponse } from 'next/server';
import { prisma } from '@pulso/database';
import { getRequestId, logServer } from '@/server/logging';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  // El runtime Personal embebido no depende de PostgreSQL: persiste sus datos
  // localmente y usa el servidor Next sólo para servir la UI. Producción no
  // define esta marca y mantiene el chequeo estricto de la base de datos.
  if (process.env.PULSO_RUNTIME === 'desktop-local') {
    return NextResponse.json(
      { status: 'ready', runtime: 'desktop-local' },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  const requestId = getRequestId(request);
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('readiness_timeout')), 2_000)),
    ]);
    return NextResponse.json({ status: 'ready' }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    logServer('error', 'readiness_failed', { requestId, error });
    return NextResponse.json(
      { status: 'not_ready' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
