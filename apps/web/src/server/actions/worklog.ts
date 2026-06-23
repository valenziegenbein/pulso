'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@pulso/database';
import { approveWorklog, canApproveWorklog } from '@pulso/domain';
import { saveWorklogSchema, type WorklogSource } from '@pulso/shared';
import { requireAuth } from '@/lib/auth/context';
import { auditLogger, worklogRepo } from '@/server/deps';

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
  const task = data.taskId
    ? await prisma.task.findFirst({ where: { id: data.taskId, organizationId: ctx.organizationId } })
    : null;
  const teamId = task?.teamId ?? data.teamId ?? null;

  const entry = await prisma.worklogEntry.create({
    data: {
      organizationId: ctx.organizationId,
      authorId: ctx.user.id,
      teamId,
      taskId: data.taskId ?? null,
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
        taskId: data.taskId ?? null,
        worklogEntryId: entry.id,
      },
    });
  }

  revalidatePath('/');
  if (data.taskId) revalidatePath(`/tasks/${data.taskId}`);
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
  const entry = await prisma.worklogEntry.findFirst({
    where: { id: worklogId, organizationId: ctx.organizationId },
  });
  if (!entry) throw new Error('Entrada no encontrada.');
  const teamIds = await prisma.teamMembership.findMany({ where: { userId: ctx.user.id }, select: { teamId: true } });
  if (!canApproveWorklog({ ...ctx.user, role: ctx.role, permissions: ctx.permissions, teamIds: teamIds.map((t) => t.teamId) }, entry)) {
    throw new Error('Sin permiso para aprobar esta bitacora.');
  }

  await approveWorklog(
    { worklog: worklogRepo, audit: auditLogger },
    { actorId: ctx.user.id, organizationId: ctx.organizationId, worklogId },
  );

  revalidatePath('/');
  if (entry.taskId) revalidatePath(`/tasks/${entry.taskId}`);
}
