import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from './anthropic';
import { OpenAICompatibleProvider } from './openai-compatible';

describe('vision adapters', () => {
  it('serializa imagenes para proveedores OpenAI-compatible', async () => {
    let payload: unknown;
    const fetchImpl: typeof fetch = async (_input, init) => {
      payload = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ model: 'm', choices: [{ message: { content: 'ok' } }] }));
    };

    const provider = new OpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1', model: 'm', fetchImpl });
    await provider.complete({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'mirar captura' },
            { type: 'image', dataUrl: 'data:image/jpeg;base64,abc123', detail: 'high' },
          ],
        },
      ],
    });

    expect(payload).toMatchObject({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'mirar captura' },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc123', detail: 'high' } },
          ],
        },
      ],
    });
  });

  it('serializa imagenes para Anthropic Messages API', async () => {
    let payload: unknown;
    const fetchImpl: typeof fetch = async (_input, init) => {
      payload = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ model: 'm', content: [{ type: 'text', text: 'ok' }] }));
    };

    const provider = new AnthropicProvider({ apiKey: 'sk-test', model: 'm', fetchImpl });
    await provider.complete({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'mirar captura' },
            { type: 'image', dataUrl: 'data:image/jpeg;base64,abc123' },
          ],
        },
      ],
    });

    expect(payload).toMatchObject({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'mirar captura' },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: 'abc123' },
            },
          ],
        },
      ],
    });
  });
});
