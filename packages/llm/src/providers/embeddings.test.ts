import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from './anthropic';
import { MockProvider } from './mock';
import { OpenAICompatibleProvider } from './openai-compatible';

describe('embed()', () => {
  it('OpenAICompatibleProvider: llama /embeddings y reordena por index', async () => {
    let payload: unknown;
    const fetchImpl: typeof fetch = async (_input, init) => {
      payload = JSON.parse(String(init?.body));
      // El server responde fuera de orden a propósito; el adapter debe reordenar.
      return new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [0, 1] },
            { index: 0, embedding: [1, 0] },
          ],
        }),
      );
    };
    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', model: 'nomic-embed-text', fetchImpl });
    const vectors = await provider.embed(['primero', 'segundo']);

    expect(payload).toMatchObject({ model: 'nomic-embed-text', input: ['primero', 'segundo'] });
    expect(vectors).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it('OpenAICompatibleProvider: propaga error si el proveedor responde mal', async () => {
    const fetchImpl: typeof fetch = async () => new Response('nope', { status: 500 });
    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', model: 'm', fetchImpl });
    await expect(provider.embed(['x'])).rejects.toThrow();
  });

  it('AnthropicProvider: no implementa embed (no soportado)', () => {
    const provider = new AnthropicProvider({ apiKey: 'sk-test', model: 'm' });
    expect(provider.embed).toBeUndefined();
  });

  it('MockProvider: embeddings determinísticos, orden preservado, similares para texto similar', async () => {
    const provider = new MockProvider();
    const [a, b, c] = await provider.embed(['el flujo de pago con stripe', 'el flujo de pago con stripe', 'receta de pan con masa madre']);

    expect(a).toEqual(b); // determinístico
    const cos = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i]!, 0);
    expect(cos(a!, b!)).toBeGreaterThan(cos(a!, c!)); // texto idéntico > texto no relacionado
  });
});
