'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@pulso/database';
import { assignTask, PERMISSIONS } from '@pulso/domain';
import { TASK_STATUS_TRANSITIONS, addBlockerSchema, createTaskSchema, type TaskStatus } from '@pulso/shared';
import { hasPermission, requireAuth } from '@/lib/auth/context';
import { auditLogger, taskRepo } from '@/server/deps';
import type { AssignState } from '@/server/action-types';

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : undefined;
}

export async function createTaskAction(formData: FormData): Promise<void> {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.TASK_CREATE)) throw new Error('Sin permiso para crear tareas.');

  const parsed = createTaskSchema.parse({
    title: str(formData, 'title'),
    description: str(formData, 'description'),
    expectedOutcome: str(formData, 'expectedOutcome'),
    teamId: str(formData, 'teamId'),
    assigneeId: str(formData, 'assigneeId'),
    priority: str(formData, 'priority') ?? 'MEDIUM',
    dueDate: str(formData, 'dueDate'),
    definitionOfDone: str(formData, 'definitionOfDone'),
  });

  const task = await taskRepo.create({
    organizationId: ctx.organizationId,
    teamId: parsed.teamId,
    parentTaskId: parsed.parentTaskId ?? null,
    title: parsed.title,
    description: parsed.description ?? null,
    expectedOutcome: parsed.expectedOutcome ?? null,
    assigneeId: parsed.assigneeId ?? null,
    createdById: ctx.user.id,
    priority: parsed.priority,
    status: 'TODO',
    dueDate: parsed.dueDate ?? null,
    definitionOfDone: parsed.definitionOfDone ?? null,
  });

  await auditLogger.record({
    organizationId: ctx.organizationId,
    actorId: ctx.user.id,
    action: 'TASK_CREATED',
    entityType: 'Task',
    entityId: task.id,
  });

  revalidatePath('/tasks');
  revalidatePath('/teams');
  revalidatePath('/members');
  redirect(`/tasks/${task.id}`);
}

export async function assignTaskAction(_prev: AssignState, formData: FormData): Promise<AssignState> {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.TASK_ASSIGN)) {
    return { status: 'error', message: 'No tenes permiso para asignar tareas.' };
  }
  const taskId = str(formData, 'taskId');
  const assigneeId = str(formData, 'assigneeId');
  const acknowledge = formData.get('acknowledge') === 'true';
  if (!taskId || !assigneeId) return { status: 'error', message: 'Elegi una persona.' };

  const result = await assignTask(
    { tasks: taskRepo, audit: auditLogger },
    { actorId: ctx.user.id, organizationId: ctx.organizationId, taskId, assigneeId, acknowledgeOverload: acknowledge },
  );

  if (result.status === 'overload_warning') {
    return {
      status: 'overload_warning',
      message: `Esta persona ya tiene carga ${result.overload.level}. Asignar igual?`,
      signals: result.overload.signals.map((s) => ({ code: s.code, message: s.message })),
    };
  }

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath('/');
  revalidatePath('/admin');
  return { status: 'assigned', message: 'Tarea asignada.' };
}

export async function changeStatusAction(formData: FormData): Promise<void> {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.TASK_EDIT)) throw new Error('Sin permiso para editar tareas.');

  const taskId = str(formData, 'taskId');
  const next = str(formData, 'status') as TaskStatus | undefined;
  if (!taskId || !next) throw new Error('Datos incompletos.');

  const current = await taskRepo.findById(taskId);
  if (!current || current.organizationId !== ctx.organizationId) throw new Error('Tarea no encontrada.');

  const allowed = TASK_STATUS_TRANSITIONS[current.status];
  if (!allowed.includes(next)) throw new Error(`Transicion no permitida: ${current.status} -> ${next}.`);

  await taskRepo.update(taskId, { status: next });
  await auditLogger.record({
    organizationId: ctx.organizationId,
    actorId: ctx.user.id,
    action: next === 'DONE' ? 'TASK_CLOSED' : 'TASK_STATUS_CHANGED',
    entityType: 'Task',
    entityId: taskId,
    metadata: { from: current.status, to: next },
  });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath('/');
}

export async function addBlockerAction(formData: FormData): Promise<void> {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.TASK_EDIT)) throw new Error('Sin permiso para editar tareas.');

  const parsed = addBlockerSchema.parse({
    taskId: str(formData, 'taskId'),
    teamId: str(formData, 'teamId'),
    title: str(formData, 'title'),
    description: str(formData, 'description'),
  });
  if (!parsed.taskId && !parsed.teamId) throw new Error('Falta tarea o equipo.');

  const task = parsed.taskId
    ? await prisma.task.findFirst({ where: { id: parsed.taskId, organizationId: ctx.organizationId } })
    : null;
  const teamId = task?.teamId ?? parsed.teamId;
  if (!teamId) throw new Error('Equipo no encontrado.');

  await prisma.blocker.create({
    data: {
      organizationId: ctx.organizationId,
      teamId,
      taskId: task?.id ?? null,
      title: parsed.title ?? 'Bloqueo',
      description: parsed.description,
      status: 'OPEN',
      createdById: ctx.user.id,
    },
  });
  if (task) await prisma.task.update({ where: { id: task.id }, data: { status: 'BLOCKED' } });

  if (task) revalidatePath(`/tasks/${task.id}`);
  revalidatePath('/');
  revalidatePath('/teams');
  revalidatePath('/members');
}
