import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiReady, embedTexts, embeddingsReady, generateDraft, generatePersonalTask } from './ai';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Personal AI con cuenta Pulso', () => {
  it('usa exclusivamente el bridge Desktop para generar borradores', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      data: { suggestion: { type: 'PROGRESS', title: 'Listo', content: 'Cerré el flujo.' } },
    });
    vi.stubGlobal('window', { pulso: { isDesktop: true, accountAiRequest: request } });
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('no debe usar fetch del renderer'); }));

    expect(aiReady('account', null)).toBe(true);
    await expect(generateDraft({ note: 'cerré el flujo', ai: 'account', config: null })).resolves.toEqual({
      type: 'PROGRESS', title: 'Listo', content: 'Cerré el flujo.',
    });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ operation: 'draft', note: 'cerré el flujo' }));
  });

  it('envía tareas por el mismo canal autenticado', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      data: { suggestion: { type: 'TASK', title: 'Probar', content: 'Validar el flujo.', priority: 'high' } },
    });
    vi.stubGlobal('window', { pulso: { isDesktop: true, accountAiRequest: request } });
    await expect(generatePersonalTask({
      instruction: 'probar el flujo',
      project: { name: 'Pulso' },
      activeTasks: [],
      ai: 'account',
      config: null,
    })).resolves.toMatchObject({ type: 'TASK', title: 'Probar', priority: 'high' });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ operation: 'task' }));
  });

  it('genera embeddings administrados sin exigir una configuración BYOK', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, data: { vectors: [[0.1, 0.2]] } });
    vi.stubGlobal('window', { pulso: { isDesktop: true, accountAiRequest: request } });
    expect(embeddingsReady('account', null)).toBe(true);
    await expect(embedTexts(['documento'], 'account', null, 'RETRIEVAL_DOCUMENT')).resolves.toEqual([[0.1, 0.2]]);
    expect(request).toHaveBeenCalledWith({ operation: 'embed', texts: ['documento'], taskType: 'RETRIEVAL_DOCUMENT' });
  });

  it('mapea una cuenta no autorizada sin exponer el error remoto', async () => {
    vi.stubGlobal('window', {
      pulso: { isDesktop: true, accountAiRequest: vi.fn().mockResolvedValue({ ok: false, status: 403, error: 'not_allowlisted' }) },
    });
    await expect(generateDraft({ note: 'avance', ai: 'account', config: null })).rejects.toMatchObject({
      name: 'AiError', code: 'unauthorized',
    });
  });
});

describe('Personal BYOK seguro', () => {
  it('carga la key desde Electron sólo al generar y no desde la configuración persistida', async () => {
    const loadKey = vi.fn().mockResolvedValue('synthetic-runtime-key');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      suggestion: { type: 'NOTE', title: 'Seguro', content: 'Generado con BYOK.' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('window', { pulso: { isDesktop: true, loadPersonalAiKey: loadKey } });
    vi.stubGlobal('fetch', fetchMock);

    const config = { provider: 'openai' as const, baseUrl: 'https://api.openai.com/v1', model: 'gpt-test', hasApiKey: true };
    expect(aiReady('byok', config)).toBe(true);
    await expect(generateDraft({ note: 'avance', ai: 'byok', config })).resolves.toMatchObject({ title: 'Seguro' });
    expect(loadKey).toHaveBeenCalledWith('openai');
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ apiKey: 'synthetic-runtime-key', provider: 'openai' });
    expect(config).not.toHaveProperty('apiKey');
  });

  it('no considera listo un proveedor cloud sin referencia al vault', () => {
    vi.stubGlobal('window', { pulso: { isDesktop: true } });
    expect(aiReady('byok', { provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-test' })).toBe(false);
  });
});
