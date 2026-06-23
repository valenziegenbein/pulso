import { describe, expect, it } from 'vitest';
import type { LLMProvider } from './provider';
import { fallbackTaskSuggestion, TaskSuggestionService } from './task-suggestion.service';

describe('TaskSuggestionService', () => {
  it('parsea una sugerencia estructurada del proveedor', async () => {
    const provider: LLMProvider = {
      id: 'fake',
      async complete() {
        return {
          model: 'x',
          text: JSON.stringify({
            title: 'Preparar propuesta de mejora para tickets internos',
            description: 'Revisar el flujo actual y proponer proximos pasos.',
            expectedOutcome: 'Documento breve con prioridades.',
            definitionOfDone: 'Propuesta revisada por el admin.',
            suggestedPriority: 'HIGH',
            suggestedAssigneeId: 'u2',
            reasoning: 'Luis pertenece a Operaciones.',
          }),
        };
      },
    };

    const suggestion = await new TaskSuggestionService(provider).suggest({
      instruction: 'Preparar propuesta para mejorar tickets internos',
      team: { id: 'ops', name: 'Operaciones' },
      members: [{ id: 'u2', name: 'Luis Romero', teamIds: ['ops'] }],
    });

    expect(suggestion.title).toContain('tickets internos');
    expect(suggestion.suggestedPriority).toBe('HIGH');
    expect(suggestion.suggestedAssigneeId).toBe('u2');
  });

  it('degrada a sugerencia local si el proveedor no devuelve JSON', async () => {
    const provider: LLMProvider = {
      id: 'garbage',
      async complete() {
        return { model: 'x', text: 'no json' };
      },
    };

    const suggestion = await new TaskSuggestionService(provider).suggest({
      instruction: 'definir proximos pasos para soporte',
      team: { id: 'support', name: 'Soporte' },
      members: [{ id: 'u1', name: 'Carla Medina', teamIds: ['support'], activeTasks: 1 }],
    });

    expect(suggestion.title.toLowerCase()).toContain('definir proximos pasos');
    expect(suggestion.suggestedAssigneeId).toBe('u1');
  });

  it('fallback local no inventa responsable si no hay miembros', () => {
    const suggestion = fallbackTaskSuggestion({ instruction: 'armar plan de operaciones' });
    expect(suggestion.suggestedAssigneeId).toBeUndefined();
    expect(suggestion.definitionOfDone).toContain('proximos pasos');
  });
});
