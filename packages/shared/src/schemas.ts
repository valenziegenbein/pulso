import { z } from 'zod';
import {
  AGENDA_EVENT_TYPE,
  LLM_PROVIDER_TYPE,
  TASK_PRIORITY,
  TASK_STATUS,
  WORKLOG_TYPE,
} from './enums';

/**
 * Schemas Zod = contratos de entrada validados en el borde (Route Handlers /
 * Server Actions). Los tipos inferidos sirven como DTOs en toda la app.
 */

const cuid = z.string().min(1);

export const createTeamSchema = z.object({
  name: z.string().min(2).max(120),
  focus: z.string().max(280).optional(),
  parentTeamId: cuid.optional(),
});
export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export const invitePersonSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120),
  roleKey: z.enum(['ORG_ADMIN', 'TEAM_ADMIN', 'COORDINATOR', 'MEMBER', 'VIEWER']),
  teamId: cuid.optional(),
});
export type InvitePersonInput = z.infer<typeof invitePersonSchema>;

export const createTaskSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional(),
  teamId: cuid,
  assigneeId: cuid.optional(),
  priority: z.enum(TASK_PRIORITY).default('MEDIUM'),
  dueDate: z.coerce.date().optional(),
  definitionOfDone: z.string().max(1000).optional(),
  parentTaskId: cuid.optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const assignTaskSchema = z.object({
  taskId: cuid,
  assigneeId: cuid,
  /** Si la advertencia anti-sobrecarga ya fue mostrada y aceptada por el humano. */
  acknowledgeOverload: z.boolean().default(false),
});
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;

export const changeTaskStatusSchema = z.object({
  taskId: cuid,
  status: z.enum(TASK_STATUS),
});
export type ChangeTaskStatusInput = z.infer<typeof changeTaskStatusSchema>;

export const addBlockerSchema = z.object({
  taskId: cuid,
  description: z.string().min(2).max(1000),
});
export type AddBlockerInput = z.infer<typeof addBlockerSchema>;

export const createAgendaEventSchema = z.object({
  title: z.string().min(2).max(200),
  type: z.enum(AGENDA_EVENT_TYPE),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  taskId: cuid.optional(),
});
export type CreateAgendaEventInput = z.infer<typeof createAgendaEventSchema>;

/** Contexto opcional de la tarea activa para enriquecer la sugerencia IA. */
export const taskContextSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  teamName: z.string().optional(),
});

/** Input del widget rápido → POST /api/worklog/suggest */
export const worklogSuggestRequestSchema = z.object({
  note: z.string().min(1).max(500),
  task: taskContextSchema.optional(),
  /** Links o referencias que la persona adjuntó manualmente (no captura automática). */
  attachmentsHint: z.array(z.string().max(500)).max(5).optional(),
  locale: z.string().max(10).default('es'),
});
export type WorklogSuggestRequest = z.infer<typeof worklogSuggestRequestSchema>;

/** Guardar una entrada de bitácora (manual o aceptada desde una sugerencia IA). */
export const saveWorklogSchema = z.object({
  type: z.enum(WORKLOG_TYPE),
  title: z.string().min(2).max(200),
  content: z.string().min(1).max(5000),
  taskId: cuid.optional(),
  suggestionId: cuid.optional(),
});
export type SaveWorklogInput = z.infer<typeof saveWorklogSchema>;

export const configureLLMSchema = z.object({
  providerType: z.enum(LLM_PROVIDER_TYPE),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1),
  /** Texto plano que el servidor cifrará. NUNCA vuelve al frontend. */
  apiKey: z.string().optional(),
});
export type ConfigureLLMInput = z.infer<typeof configureLLMSchema>;
