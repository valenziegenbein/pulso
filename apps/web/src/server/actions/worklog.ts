'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pulso/database';
import { canApproveWorklog, canCreateWorklogForTarget } from '@pulso/domain';
import { saveWorklogSchema, type WorklogSource } from '@pulso/shared';
import { requireAuth } from '@/lib/auth/context';
import { assertAllowed, assertWorklogAccess, getAuthorizedUser, requireTaskInOrg, requireTeamInOrg } from '@/server/authz';
import { auditLogger } from '@/server/deps';

/**
 * Guarda una entrada de bitácora como BORRADOR (estado DRAFT).
 * Llamada desde el widget al "Aceptar" una sugerencia, o desde un formulario
 * manual. Nunca publica: la publicación es un paso humano explícito (approve).
 */
export async function saveWorklogDraftAction(input: {
  type: string;
  title: string;
  content: string;
  teamId?: string;
  taskId?: string;
  source?: WorklogSource;
  /** Adjunto manual y voluntario (captura o link). Se persiste como Attachment. */
  attachment?: { url: string; kind?: 'SCREENSHOT' | 'LINK' };
}): Promise<{ id: string }> {
  const ctx = await requireAuth();
  const data = saveWorklogSchema.parse({
    type: input.type,
    title: input.title,
    content: input.content,
    teamId: input.teamId,
    taskId: input.taskId,
  });
  const task = data.taskId ? await requireTaskInOrg(ctx, data.taskId) : null;
  const teamId = task?.teamId ?? data.teamId ?? null;
  const [actor, team] = await Promise.all([
    getAuthorizedUser(ctx),
    teamId ? requireTeamInOrg(ctx, teamId) : Promise.resolve(null),
  ]);
  assertAllowed(
    canCreateWorklogForTarget(actor, { teamId: team?.id ?? null, assigneeId: task?.assigneeId ?? null }),
    'Sin permiso para registrar avances en esta tarea.',
  );

  const entry = await prisma.worklogEntry.create({
    data: {
      organizationId: ctx.organizationId,
      authorId: ctx.user.id,
      teamId,
      taskId: task?.id ?? null,
      type: data.type,
      status: 'DRAFT',
      source: input.source ?? 'MANUAL',
      title: data.title,
      content: data.content,
    },
  });

  // Adjunto opcional: siempre manual y voluntario (no hay captura automática).
  const url = input.attachment?.url?.trim();
  if (url) {
    await prisma.attachment.create({
      data: {
        organizationId: ctx.organizationId,
        kind: input.attachment?.kind ?? 'SCREENSHOT',
        url: url.slice(0, 2000),
        isManual: true,
        uploadedById: ctx.user.id,
        taskId: task?.id ?? null,
        worklogEntryId: entry.id,
      },
    });
  }

  revalidatePath('/');
  if (task) revalidatePath(`/tasks/${task.id}`);
  return { id: entry.id };
}

/** Crea una entrada de bitácora manual desde un formulario (FormData). */
export async function createWorklogFormAction(formData: FormData): Promise<void> {
  const type = String(formData.get('type') ?? 'NOTE');
  const title = String(formData.get('title') ?? '').trim();
  const content = String(formData.get('content') ?? '').trim();
  const teamId = String(formData.get('teamId') ?? '').trim() || undefined;
  const taskId = String(formData.get('taskId') ?? '').trim() || undefined;
  await saveWorklogDraftAction({ type, title, content, teamId, taskId, source: 'MANUAL' });
}

/** Publica (aprueba) un borrador. Único camino DRAFT → PUBLISHED. */
export async function approveWorklogAction(formData: FormData): Promise<void> {
  const ctx = await requireAuth();
  const worklogId = String(formData.get('worklogId') ?? '').trim();
  if (!worklogId) throw new Error('Falta el id de la entrada.');

  // Solo el autor (o quien tenga worklog.approve) puede publicar.
  const entry = await assertWorklogAccess(ctx, worklogId, 'approve');
  const actor = await getAuthorizedUser(ctx);
  if (!canApproveWorklog(actor, entry)) {
    throw new Error('Sin permiso para aprobar esta bitacora.');
  }

  const updated = await prisma.worklogEntry.updateMany({
    where: { id: entry.id, organizationId: ctx.organizationId },
    data: { status: 'PUBLISHED', approvedById: ctx.user.id, publishedAt: new Date() },
  });
  if (updated.count !== 1) throw new Error('No se pudo aprobar esta bitacora.');
  await auditLogger.record({
    organizationId: ctx.organizationId,
    actorId: ctx.user.id,
    action: 'WORKLOG_APPROVED',
    entityType: 'WorklogEntry',
    entityId: entry.id,
  });

  revalidatePath('/');
  if (entry.taskId) revalidatePath(`/tasks/${entry.taskId}`);
}
