import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/context';
import { listKnowledgeTargets } from '@/server/knowledge';

export async function GET(): Promise<NextResponse> {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  return NextResponse.json(await listKnowledgeTargets(ctx), { headers: { 'cache-control': 'no-store' } });
}
