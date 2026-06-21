'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@pulso/database';
import { assignTask, PERMISSIONS } from '@pulso/domain';
import { TASK_STATUS_TRANSITIONS, createTaskSchema, type TaskStatus } from '@pulso/shared';
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
    assigneeId: parsed.assigneeId ?? null,
    createdById: ctx.user.id,
    priority: parsed.priority,
    status: 'BACKLOG',
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
  redirect(`/tasks/${task.id}`);
}

export async function assignTaskAction(_prev: AssignState, formData: FormData): Promise<AssignState> {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.TASK_ASSIGN)) {
    return { status: 'error', message: 'No tenés permiso para asignar tareas.' };
  }
  const taskId = str(formData, 'taskId');
  const assigneeId = str(formData, 'assigneeId');
  const acknowledge = formData.get('acknowledge') === 'true';
  if (!taskId || !assigneeId) return { status: 'error', message: 'Elegí una persona.' };

  const result = await assignTask(
    { tasks: taskRepo, audit: auditLogger },
    { actorId: ctx.user.id, organizationId: ctx.organizationId, taskId, assigneeId, acknowledgeOverload: acknowledge },
  );

  if (result.status === 'overload_warning') {
    return {
      status: 'overload_warning',
      message: `Esta persona ya tiene carga ${result.overload.level}. ¿Asignar igual?`,
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
  if (!allowed.includes(next)) throw new Error(`Transición no permitida: ${current.status} → ${next}.`);

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

  const taskId = str(formData, 'taskId');
  const description = str(formData, 'description');
  if (!taskId || !description) throw new Error('Describí el bloqueo.');

  await prisma.blocker.create({ data: { taskId, description, createdById: ctx.user.id } });
  await prisma.task.update({ where: { id: taskId }, data: { status: 'BLOCKED' } });

  revalidatePath(`/tasks/${taskId}`);
}
