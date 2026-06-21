import type { TaskPriority, TaskStatus } from '@pulso/shared';

/**
 * Reglas anti-sobrecarga.
 *
 * Objetivo ético: PROTEGER a la persona antes de asignarle más trabajo, no
 * rankearla ni medir su productividad. Las señales advierten; no castigan.
 * El humano siempre puede continuar tras reconocer la advertencia.
 */

export interface WorkloadSnapshot {
  /** Tareas activas (no DONE/CANCELLED). */
  activeTasks: number;
  /** Tareas con prioridad URGENT activas. */
  urgentTasks: number;
  /** Tareas vencidas (dueDate pasada y no terminadas). */
  overdueTasks: number;
  /** Tareas con bloqueo abierto. */
  blockedTasks: number;
  /** Tareas que vencen dentro de la ventana próxima (ver thresholds). */
  dueSoonTasks: number;
  /** Tareas activas sin definición de terminado. */
  tasksWithoutDefinitionOfDone: number;
}

export interface OverloadThresholds {
  maxActiveTasks: number;
  maxUrgentTasks: number;
  maxOverdueTasks: number;
  maxBlockedTasks: number;
  maxDueSoonTasks: number;
  maxTasksWithoutDoD: number;
  /** Días para considerar "vence pronto". */
  dueSoonWindowDays: number;
}

export const DEFAULT_OVERLOAD_THRESHOLDS: OverloadThresholds = {
  maxActiveTasks: 7,
  maxUrgentTasks: 2,
  maxOverdueTasks: 1,
  maxBlockedTasks: 3,
  maxDueSoonTasks: 4,
  maxTasksWithoutDoD: 2,
  dueSoonWindowDays: 2,
};

export type OverloadLevel = 'ok' | 'warning' | 'critical';

export type OverloadCode =
  | 'TOO_MANY_ACTIVE'
  | 'TOO_MANY_URGENT'
  | 'TOO_MANY_OVERDUE'
  | 'TOO_MANY_BLOCKED'
  | 'TOO_MANY_DUE_SOON'
  | 'TOO_MANY_WITHOUT_DOD';

export interface OverloadSignal {
  code: OverloadCode;
  level: OverloadLevel;
  message: string;
}

export interface OverloadResult {
  level: OverloadLevel;
  signals: OverloadSignal[];
  /** true si conviene advertir antes de asignar más trabajo. */
  shouldWarn: boolean;
}

/** Vencidas y urgentes pesan como críticas; el resto como advertencia. */
const CRITICAL_CODES = new Set<OverloadCode>(['TOO_MANY_OVERDUE', 'TOO_MANY_URGENT']);

export function evaluateOverload(
  snapshot: WorkloadSnapshot,
  thresholds: OverloadThresholds = DEFAULT_OVERLOAD_THRESHOLDS,
): OverloadResult {
  const checks: Array<{ code: OverloadCode; over: boolean; message: string }> = [
    {
      code: 'TOO_MANY_ACTIVE',
      over: snapshot.activeTasks > thresholds.maxActiveTasks,
      message: `Tiene ${snapshot.activeTasks} tareas activas (máx. sugerido ${thresholds.maxActiveTasks}).`,
    },
    {
      code: 'TOO_MANY_URGENT',
      over: snapshot.urgentTasks > thresholds.maxUrgentTasks,
      message: `Tiene ${snapshot.urgentTasks} tareas urgentes en paralelo.`,
    },
    {
      code: 'TOO_MANY_OVERDUE',
      over: snapshot.overdueTasks > thresholds.maxOverdueTasks,
      message: `Tiene ${snapshot.overdueTasks} tareas vencidas sin cerrar.`,
    },
    {
      code: 'TOO_MANY_BLOCKED',
      over: snapshot.blockedTasks > thresholds.maxBlockedTasks,
      message: `Tiene ${snapshot.blockedTasks} tareas bloqueadas esperando desbloqueo.`,
    },
    {
      code: 'TOO_MANY_DUE_SOON',
      over: snapshot.dueSoonTasks > thresholds.maxDueSoonTasks,
      message: `Tiene ${snapshot.dueSoonTasks} tareas que vencen en los próximos ${thresholds.dueSoonWindowDays} días.`,
    },
    {
      code: 'TOO_MANY_WITHOUT_DOD',
      over: snapshot.tasksWithoutDefinitionOfDone > thresholds.maxTasksWithoutDoD,
      message: `Tiene ${snapshot.tasksWithoutDefinitionOfDone} tareas sin definición de terminado.`,
    },
  ];

  const signals: OverloadSignal[] = checks
    .filter((c) => c.over)
    .map((c) => ({
      code: c.code,
      level: CRITICAL_CODES.has(c.code) ? 'critical' : 'warning',
      message: c.message,
    }));

  const level: OverloadLevel = signals.some((s) => s.level === 'critical')
    ? 'critical'
    : signals.length > 0
      ? 'warning'
      : 'ok';

  return { level, signals, shouldWarn: signals.length > 0 };
}

/** Subconjunto de una tarea necesario para calcular la carga. */
export interface TaskLike {
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  definitionOfDone: string | null;
}

/** Construye un snapshot de carga a partir de las tareas de una persona. */
export function buildWorkloadSnapshot(
  tasks: readonly TaskLike[],
  now: Date = new Date(),
  thresholds: OverloadThresholds = DEFAULT_OVERLOAD_THRESHOLDS,
): WorkloadSnapshot {
  const active = tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');
  const dueSoonMs = thresholds.dueSoonWindowDays * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();

  return {
    activeTasks: active.length,
    urgentTasks: active.filter((t) => t.priority === 'URGENT').length,
    overdueTasks: active.filter((t) => t.dueDate !== null && t.dueDate.getTime() < nowMs).length,
    blockedTasks: active.filter((t) => t.status === 'BLOCKED').length,
    dueSoonTasks: active.filter(
      (t) => t.dueDate !== null && t.dueDate.getTime() >= nowMs && t.dueDate.getTime() - nowMs <= dueSoonMs,
    ).length,
    tasksWithoutDefinitionOfDone: active.filter((t) => t.definitionOfDone === null).length,
  };
}
