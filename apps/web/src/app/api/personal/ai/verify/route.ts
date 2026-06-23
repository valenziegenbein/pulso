import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { CLOUD_HOSTS, fetchWithTimeout } from '@/lib/personal/ai-endpoint';

/**
 * POST /api/personal/ai/verify
 *
 * Valida una API key cloud (OpenAI / Anthropic) y devuelve los modelos de la
 * cuenta para autocompletar el selector. Proxy server-side: la key viaja a un
 * host hardcodeado por HTTPS y NUNCA vuelve al frontend ni se persiste.
 */
const ANTHROPIC_VERSION = '2023-06-01';

interface VerifyBody {
  provider?: unknown;
  apiKey?: unknown;
}

/** Modelos de chat de OpenAI (filtra embeddings, whisper, tts, etc.). */
function isOpenAiChatModel(id: string): boolean {
  return /^(gpt-|chatgpt-|o1|o3|o4)/.test(id) && !/(audio|realtime|transcribe|tts|image|search)/.test(id);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as VerifyBody | null;
  const provider = body?.provider;
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  if ((provider !== 'openai' && provider !== 'anthropic') || !apiKey) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const doFetch = fetchWithTimeout(8000);
  try {
    if (provider === 'openai') {
      const res = await doFetch(`https://${CLOUD_HOSTS.openai}/v1/models`, {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      if (res.status === 401 || res.status === 403) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      if (!res.ok) return NextResponse.json({ error: 'unreachable' }, { status: 502 });
      const data = (await res.json()) as { data?: Array<{ id?: string }> };
      const models = (data.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => Boolean(id) && isOpenAiChatModel(id!))
        .sort();
      return NextResponse.json({ models });
    }

    // anthropic
    const res = await doFetch(`https://${CLOUD_HOSTS.anthropic}/v1/models?limit=100`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    });
    if (res.status === 401 || res.status === 403) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!res.ok) return NextResponse.json({ error: 'unreachable' }, { status: 502 });
    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    const models = (data.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ error: 'unreachable' }, { status: 502 });
  }
}
