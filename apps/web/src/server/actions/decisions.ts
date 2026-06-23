'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pulso/database';
import { PERMISSIONS } from '@pulso/domain';
import { requestDecisionSchema } from '@pulso/shared';
import { hasPermission, requireAuth } from '@/lib/auth/context';

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : undefined;
}

export async function requestDecisionAction(formData: FormData): Promise<void> {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.TASK_EDIT)) throw new Error('Sin permiso para pedir decisiones.');

  const taskId = str(formData, 'taskId');
  const task = taskId
    ? await prisma.task.findFirst({ where: { id: taskId, organizationId: ctx.organizationId } })
    : null;

  const parsed = requestDecisionSchema.parse({
    teamId: str(formData, 'teamId') ?? task?.teamId,
    taskId: task?.id,
    title: str(formData, 'title'),
    context: str(formData, 'context'),
  });

  await prisma.decisionRequest.create({
    data: {
      organizationId: ctx.organizationId,
      teamId: parsed.teamId,
      taskId: parsed.taskId ?? null,
      requestedById: ctx.user.id,
      title: parsed.title,
      context: parsed.context,
      status: 'OPEN',
    },
  });

  revalidatePath('/');
  revalidatePath('/teams');
  if (task) revalidatePath(`/tasks/${task.id}`);
}

export async function resolveDecisionAction(formData: FormData): Promise<void> {
  const ctx = await requireAuth();
  if (!hasPermission(ctx, PERMISSIONS.TASK_EDIT)) throw new Error('Sin permiso para resolver decisiones.');
  const id = str(formData, 'decisionId');
  if (!id) throw new Error('Falta la decision.');

  await prisma.decisionRequest.update({
    where: { id },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });

  revalidatePath('/');
  revalidatePath('/teams');
}
