import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { assertLocalBaseUrl, fetchWithTimeout, LocalUrlError } from '@/lib/personal/ai-endpoint';

/**
 * POST /api/personal/ai/models
 *
 * Lista los modelos disponibles en un servidor LLM local compatible con OpenAI
 * (LM Studio, Ollama, vLLM). Sirve para que el onboarding/ajustes verifiquen la
 * conexión y autocompleten el modelo, así "configurar el puerto" alcanza.
 * Proxy server-side: evita CORS (Ollama bloquea orígenes del navegador).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as { baseUrl?: unknown } | null;
  const raw = body?.baseUrl;
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 300) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  let baseUrl: string;
  try {
    baseUrl = assertLocalBaseUrl(raw);
  } catch (e) {
    return NextResponse.json({ error: e instanceof LocalUrlError ? e.code : 'bad_url' }, { status: 400 });
  }

  try {
    const res = await fetchWithTimeout(4000)(`${baseUrl}/models`, {
      headers: { 'content-type': 'application/json' },
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'unreachable' }, { status: 502 });
    }
    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    const models = (data.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ error: 'unreachable' }, { status: 502 });
  }
}
