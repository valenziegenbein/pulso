import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/context';
import { PayloadTooLargeError, readJsonBody } from '@/server/http';
import { deleteKnowledgeSource, KnowledgeInputError } from '@/server/knowledge';

export async function DELETE(req: Request): Promise<NextResponse> {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  try {
    const body = await readJsonBody(req, 4_096) as { sourceId?: unknown };
    const sourceId = typeof body?.sourceId === 'string' ? body.sourceId : '';
    const deleted = await deleteKnowledgeSource(ctx, sourceId);
    return deleted
      ? NextResponse.json({ deleted: true })
      : NextResponse.json({ error: 'not_found' }, { status: 404 });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    if (error instanceof KnowledgeInputError) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    throw error;
  }
}
