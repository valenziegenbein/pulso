/**
 * Enums del dominio como uniones de strings (const).
 *
 * Fuente de verdad framework-free: tanto `@pulso/domain` como `apps/web` los
 * consumen sin depender de Prisma. Los `enum` de Prisma (ver schema.prisma)
 * deben mantenerse alineados con estos valores.
 */

export const TASK_STATUS = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'IN_REVIEW',
  'DONE',
  'CANCELLED',
] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

/** Transiciones de estado permitidas. Estados terminales no transicionan. */
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  BACKLOG: ['TODO', 'IN_PROGRESS', 'CANCELLED'],
  TODO: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  IN_PROGRESS: ['BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
  IN_REVIEW: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
};

export const TASK_PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITY)[number];

export const WORKLOG_TYPE = [
  'PROGRESS', // avance
  'RESEARCH', // investigación
  'BLOCKER', // bloqueo
  'DECISION', // decisión
  'NOTE', // nota
  'DELIVERY', // entrega
  'HELP_REQUEST', // pedido de ayuda
  'RISK', // riesgo
  'PRIORITY_CHANGE', // cambio de prioridad
] as const;
export type WorklogType = (typeof WORKLOG_TYPE)[number];

export const WORKLOG_STATUS = ['DRAFT', 'PUBLISHED', 'DISCARDED'] as const;
export type WorklogStatus = (typeof WORKLOG_STATUS)[number];

export const WORKLOG_SOURCE = ['MANUAL', 'AI_SUGGESTED'] as const;
export type WorklogSource = (typeof WORKLOG_SOURCE)[number];

export const BLOCKER_STATUS = ['OPEN', 'RESOLVED'] as const;
export type BlockerStatus = (typeof BLOCKER_STATUS)[number];

export const DECISION_STATUS = ['OPEN', 'RESOLVED', 'CANCELED'] as const;
export type DecisionStatus = (typeof DECISION_STATUS)[number];

export const AGENDA_EVENT_TYPE = [
  'MEETING',
  'FOCUS_BLOCK',
  'DEADLINE',
  'MANUAL',
  'TASK_DUE',
] as const;
export type AgendaEventType = (typeof AGENDA_EVENT_TYPE)[number];

export const ATTACHMENT_KIND = ['LINK', 'FILE', 'SCREENSHOT'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KIND)[number];

export const LLM_PROVIDER_TYPE = ['OPENAI_COMPATIBLE', 'ANTHROPIC', 'MOCK'] as const;
export type LLMProviderType = (typeof LLM_PROVIDER_TYPE)[number];

export const ROLE_KEY = [
  'SUPER_ADMIN',
  'ORG_ADMIN',
  'TEAM_ADMIN',
  'COORDINATOR',
  'MEMBER',
  'VIEWER',
] as const;
export type RoleKey = (typeof ROLE_KEY)[number];
