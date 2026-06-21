import type { AuditLogger, WorklogRecord, WorklogRepository } from '../ports';

export interface ApproveWorklogDeps {
  worklog: WorklogRepository;
  audit: AuditLogger;
}

export interface ApproveWorklogInput {
  actorId: string;
  organizationId: string;
  worklogId: string;
}

/**
 * Caso de uso: aprobar/publicar una entrada de bitácora.
 *
 * Es el único camino para que un borrador (incluido el generado por IA) pase
 * a PUBLISHED. Siempre requiere un actor humano y deja registro de auditoría.
 */
export async function approveWorklog(
  deps: ApproveWorklogDeps,
  input: ApproveWorklogInput,
): Promise<WorklogRecord> {
  const entry = await deps.worklog.publish(input.worklogId, input.actorId);
  await deps.audit.record({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: 'WORKLOG_APPROVED',
    entityType: 'WorklogEntry',
    entityId: input.worklogId,
  });
  return entry;
}
