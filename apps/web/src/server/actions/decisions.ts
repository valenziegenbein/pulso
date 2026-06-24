'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pulso/database';
import { canManageTask, canResolveDecision, PERMISSIONS } from '@pulso/domain';
import { requestDecisionSchema } from '@pulso/shared';
import { hasPermission, requireAuth } from '@/lib/auth/context';
import { assertAllowed, getAuthorizedUser, requireDecisionInOrg, requireTaskInOrg, requireTeamInOrg } from '@/server/authz';

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
    ? await requireTaskInOrg(ctx, taskId)
    : null;

  const parsed = requestDecisionSchema.parse({
    teamId: str(formData, 'teamId') ?? task?.teamId,
    taskId: task?.id,
    title: str(formData, 'title'),
    context: str(formData, 'context'),
  });
  const [actor, team] = await Promise.all([getAuthorizedUser(ctx), requireTeamInOrg(ctx, parsed.teamId)]);
  assertAllowed(
    task ? canManageTask(actor, task) : canManageTask(actor, { teamId: team.id, assigneeId: null }),
    'Sin permiso para pedir decisiones en este equipo.',
  );

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
  const [actor, decision] = await Promise.all([getAuthorizedUser(ctx), requireDecisionInOrg(ctx, id)]);
  assertAllowed(canResolveDecision(actor, decision), 'Sin permiso para resolver esta decision.');

  const updated = await prisma.decisionRequest.updateMany({
    where: { id: decision.id, organizationId: ctx.organizationId },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });
  if (updated.count !== 1) throw new Error('No se pudo resolver esta decision.');

  revalidatePath('/');
  revalidatePath('/teams');
}
