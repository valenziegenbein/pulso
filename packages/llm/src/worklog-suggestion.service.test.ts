import { describe, expect, it } from 'vitest';
import { MockProvider } from './providers/mock';
import { WorklogSuggestionService } from './worklog-suggestion.service';
import type { CompletionRequest, LLMProvider } from './provider';

describe('WorklogSuggestionService', () => {
  it('genera un borrador a partir de una micro-nota (MockProvider)', async () => {
    const service = new WorklogSuggestionService(new MockProvider());
    const suggestion = await service.suggest({ note: 'investigando intercom' });

    expect(suggestion.type).toBe('RESEARCH');
    expect(suggestion.title.length).toBeGreaterThan(0);
    expect(suggestion.content).toContain('intercom');
  });

  it('degrada con seguridad si el proveedor no devuelve JSON', async () => {
    const garbage: LLMProvider = {
      id: 'garbage',
      async complete() {
        return { text: 'esto no es json', model: 'x' };
      },
    };
    const service = new WorklogSuggestionService(garbage);
    const suggestion = await service.suggest({ note: 'algo' });

    expect(suggestion.type).toBe('NOTE');
    expect(suggestion.content).toBe('esto no es json');
  });

  it('respeta un type válido devuelto por el proveedor', async () => {
    const decision: LLMProvider = {
      id: 'fake',
      async complete() {
        return {
          text: '{"type":"DECISION","title":"Elegir CRM","content":"Decidí usar X."}',
          model: 'x',
        };
      },
    };
    const service = new WorklogSuggestionService(decision);
    const suggestion = await service.suggest({ note: 'elegir crm' });

    expect(suggestion.type).toBe('DECISION');
    expect(suggestion.title).toBe('Elegir CRM');
  });

  it('pasa capturas adjuntas como contexto multimodal al proveedor', async () => {
    let captured: CompletionRequest | undefined;
    const multimodal: LLMProvider = {
      id: 'fake-multimodal',
      async complete(request) {
        captured = request;
        return {
          text: '{"type":"PROGRESS","title":"Revisar pantalla","content":"Estoy revisando la pantalla adjunta."}',
          model: 'x',
        };
      },
    };

    const service = new WorklogSuggestionService(multimodal);
    await service.suggest({
      note: 'revisando la pantalla del widget',
      images: [{ dataUrl: 'data:image/jpeg;base64,abc123', mediaType: 'image/jpeg' }],
    });

    const userMessage = captured?.messages.find((message) => message.role === 'user');
    expect(Array.isArray(userMessage?.content)).toBe(true);
    if (!Array.isArray(userMessage?.content)) throw new Error('expected multimodal content');
    expect(userMessage.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text', text: expect.stringContaining('revisando la pantalla del widget') }),
        expect.objectContaining({ type: 'image', dataUrl: 'data:image/jpeg;base64,abc123' }),
      ]),
    );
  });

  it('incluye el contexto del proyecto en el prompt', async () => {
    let captured: CompletionRequest | undefined;
    const capturing: LLMProvider = {
      id: 'capturing',
      async complete(request) {
        captured = request;
        return { text: '{"type":"PROGRESS","title":"x","content":"y"}', model: 'x' };
      },
    };
    await new WorklogSuggestionService(capturing).suggest({
      note: 'avancé con el endpoint',
      projectContext: 'Pulso: organizador interno sin vigilancia.',
    });
    const userText = captured?.messages.find((m) => m.role === 'user')?.content;
    expect(typeof userText).toBe('string');
    expect(userText).toContain('Contexto del proyecto: Pulso: organizador interno sin vigilancia.');
  });

  it('degrada a texto si la generación con imagen falla (modelo sin visión)', async () => {
    let calls = 0;
    const hadImage: boolean[] = [];
    const flaky: LLMProvider = {
      id: 'flaky-vision',
      async complete(request) {
        calls += 1;
        const user = request.messages.find((m) => m.role === 'user');
        const isMultimodal = Array.isArray(user?.content);
        hadImage.push(isMultimodal);
        if (isMultimodal) throw new Error('este modelo no soporta imágenes');
        return { text: '{"type":"NOTE","title":"sin imagen","content":"generado solo con texto"}', model: 'x' };
      },
    };
    const suggestion = await new WorklogSuggestionService(flaky).suggest({
      note: 'mirá esta captura',
      images: [{ dataUrl: 'data:image/png;base64,zzz', mediaType: 'image/png' }],
    });

    expect(calls).toBe(2); // primer intento con imagen falla; reintento sin imagen
    expect(hadImage).toEqual([true, false]);
    expect(suggestion.content).toBe('generado solo con texto');
  });
});
