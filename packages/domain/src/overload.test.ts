import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OVERLOAD_THRESHOLDS,
  evaluateOverload,
  type WorkloadSnapshot,
} from './overload';

const empty: WorkloadSnapshot = {
  activeTasks: 0,
  urgentTasks: 0,
  overdueTasks: 0,
  blockedTasks: 0,
  dueSoonTasks: 0,
  tasksWithoutDefinitionOfDone: 0,
};

describe('evaluateOverload', () => {
  it('no advierte con carga vacía', () => {
    const result = evaluateOverload(empty);
    expect(result.level).toBe('ok');
    expect(result.shouldWarn).toBe(false);
    expect(result.signals).toHaveLength(0);
  });

  it('advierte (warning) por demasiadas tareas activas', () => {
    const result = evaluateOverload({
      ...empty,
      activeTasks: DEFAULT_OVERLOAD_THRESHOLDS.maxActiveTasks + 1,
    });
    expect(result.level).toBe('warning');
    expect(result.shouldWarn).toBe(true);
    expect(result.signals.map((s) => s.code)).toContain('TOO_MANY_ACTIVE');
  });

  it('escala a critical con tareas vencidas', () => {
    const result = evaluateOverload({
      ...empty,
      activeTasks: 3,
      overdueTasks: DEFAULT_OVERLOAD_THRESHOLDS.maxOverdueTasks + 1,
    });
    expect(result.level).toBe('critical');
    expect(result.signals.find((s) => s.code === 'TOO_MANY_OVERDUE')?.level).toBe('critical');
  });

  it('respeta thresholds personalizados', () => {
    const result = evaluateOverload(
      { ...empty, activeTasks: 3 },
      { ...DEFAULT_OVERLOAD_THRESHOLDS, maxActiveTasks: 2 },
    );
    expect(result.shouldWarn).toBe(true);
  });
});
