import { NextResponse } from 'next/server';
import { PERMISSIONS } from '@pulso/domain';
import { getAuthContext, hasPermission } from '@/lib/auth/context';
import { getAdminDashboard } from '@/server/queries';
import { buildTeamPulse } from '@/lib/teams/digest';

/**
 * GET /api/teams/pulse
 *
 * Genera el "pulso" del equipo con el LLM (configurado o local auto-detectado).
 * Es un upgrade en segundo plano: el dashboard ya pintó el heurístico al
 * instante; esto lo reemplaza por la versión en prosa de la IA cuando está lista.
 * Cacheado por organización (TTL) para no pegarle al modelo en cada carga.
 */
interface Entry {
  text: string;
  source: 'ai' | 'heuristic';
  ts: number;
  hash: string;
}
const cache = new Map<string, Entry>();
const TTL_MS = 10 * 60 * 1000;

export async function GET(): Promise<NextResponse> {
  const ctx = await getAuthContext();
  if (!ctx || !hasPermission(ctx, PERMISSIONS.DASHBOARD_VIEW_ADMIN)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const data = await getAdminDashboard(ctx);
  const hash = `${data.recentWorklog[0]?.id ?? '∅'}:${data.decisions.length}:${data.openBlockers.length}:${data.recentWorklog.length}`;
  const cached = cache.get(ctx.organizationId);
  if (cached && cached.hash === hash && Date.now() - cached.ts < TTL_MS) {
    return NextResponse.json({ text: cached.text, source: cached.source, cached: true });
  }

  const pulse = await buildTeamPulse(data);
  cache.set(ctx.organizationId, { ...pulse, ts: Date.now(), hash });
  return NextResponse.json({ text: pulse.text, source: pulse.source, cached: false });
}
