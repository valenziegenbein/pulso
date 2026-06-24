import {
  buildWorkloadSnapshot,
  DEFAULT_OVERLOAD_THRESHOLDS,
  evaluateOverload,
  type OverloadResult,
  type OverloadThresholds,
} from '../overload';
import type { AuditLogger, TaskRecord, TaskRepository } from '../ports';

export interface AssignTaskDeps {
  tasks: TaskRepository;
  audit: AuditLogger;
  now?: () => Date;
  thresholds?: OverloadThresholds;
}

export interface AssignTaskInput {
  actorId: string;
  organizationId: string;
  taskId: string;
  assigneeId: string;
  /** El humano vio la advertencia de sobrecarga y decidió continuar. */
  acknowledgeOverload: boolean;
}

export type AssignTaskResult =
  | { status: 'assigned'; task: TaskRecord }
  | { status: 'overload_warning'; overload: OverloadResult };

/**
 * Caso de uso: asignar una tarea a una persona.
 *
 * Antes de asignar, evalúa la carga del destinatario. Si hay señales de
 * sobrecarga y el humano todavía no las reconoció, devuelve una advertencia
 * en lugar de asignar. Nunca bloquea: el humano puede confirmar.
 */
export async function assignTask(deps: AssignTaskDeps, input: AssignTaskInput): Promise<AssignTaskResult> {
  const now = deps.now?.() ?? new Date();
  const thresholds = deps.thresholds ?? DEFAULT_OVERLOAD_THRESHOLDS;

  const current = await deps.tasks.listByAssignee(input.organizationId, input.assigneeId);
  const overload = evaluateOverload(buildWorkloadSnapshot(current, now, thresholds), thresholds);

  if (overload.shouldWarn && !input.acknowledgeOverload) {
    return { status: 'overload_warning', overload };
  }

  const task = await deps.tasks.updateInOrganization(input.organizationId, input.taskId, { assigneeId: input.assigneeId });
  await deps.audit.record({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: 'TASK_ASSIGNED',
    entityType: 'Task',
    entityId: input.taskId,
    metadata: { assigneeId: input.assigneeId, acknowledgedOverload: input.acknowledgeOverload },
  });

  return { status: 'assigned', task };
}
