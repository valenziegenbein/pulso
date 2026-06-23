import type { TaskPriority, TaskStatus, WorklogType } from '@pulso/shared';

// `satisfies` conserva la exhaustividad (todos los miembros de la unión están),
// y la exportación tipada como Record<string,string> permite indexar con los
// strings que devuelve SQLite/Prisma sin romper el tipado.

const STATUS_LABEL_MAP = {
  BACKLOG: 'Pendiente',
  TODO: 'Pendiente',
  IN_PROGRESS: 'En curso',
  BLOCKED: 'Bloqueada',
  IN_REVIEW: 'En revisión',
  DONE: 'Terminada',
  CANCELLED: 'Cancelada',
} satisfies Record<TaskStatus, string>;
export const STATUS_LABEL: Record<string, string> = STATUS_LABEL_MAP;

const PRIORITY_LABEL_MAP = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  URGENT: 'Urgente',
} satisfies Record<TaskPriority, string>;
export const PRIORITY_LABEL: Record<string, string> = PRIORITY_LABEL_MAP;

const WORKLOG_TYPE_LABEL_MAP = {
  PROGRESS: 'Avance',
  RESEARCH: 'Investigación',
  BLOCKER: 'Bloqueo',
  DECISION: 'Decisión',
  NOTE: 'Nota',
  DELIVERY: 'Entrega',
  HELP_REQUEST: 'Pedido de ayuda',
  RISK: 'Riesgo',
  PRIORITY_CHANGE: 'Cambio de prioridad',
} satisfies Record<WorklogType, string>;
export const WORKLOG_TYPE_LABEL: Record<string, string> = WORKLOG_TYPE_LABEL_MAP;

export function formatDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(d);
}
