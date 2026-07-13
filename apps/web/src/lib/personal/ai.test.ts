import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiReady, generateDraft, generatePersonalTask } from './ai';

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

  it('mapea una cuenta no autorizada sin exponer el error remoto', async () => {
    vi.stubGlobal('window', {
      pulso: { isDesktop: true, accountAiRequest: vi.fn().mockResolvedValue({ ok: false, status: 403, error: 'not_allowlisted' }) },
    });
    await expect(generateDraft({ note: 'avance', ai: 'account', config: null })).rejects.toMatchObject({
      name: 'AiError', code: 'unauthorized',
    });
  });
});
