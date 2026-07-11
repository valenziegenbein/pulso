import { describe, expect, it } from 'vitest';
import { PayloadTooLargeError, readJsonBody } from './http';

describe('bounded JSON bodies', () => {
  it('parsea payload dentro del límite', async () => {
    const request = new Request('https://pulso.test/api', { method: 'POST', body: JSON.stringify({ ok: true }) });
    await expect(readJsonBody(request, 1024)).resolves.toEqual({ ok: true });
  });

  it('rechaza content-length y streams que superan el límite', async () => {
    const declared = new Request('https://pulso.test/api', {
      method: 'POST',
      headers: { 'content-length': '100' },
      body: '{}',
    });
    await expect(readJsonBody(declared, 10)).rejects.toBeInstanceOf(PayloadTooLargeError);

    const streamed = new Request('https://pulso.test/api', { method: 'POST', body: JSON.stringify({ data: 'x'.repeat(100) }) });
    await expect(readJsonBody(streamed, 20)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });
});
