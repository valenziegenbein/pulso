import type {
  AgendaEventType,
  TaskPriority,
  TaskStatus,
  WorklogStatus,
  WorklogType,
} from '@pulso/shared';

/**
 * Puertos (interfaces) que la capa de infraestructura (`@pulso/database`)
 * implementa. El dominio depende de estas abstracciones, nunca de Prisma.
 * Esto mantiene la regla de dependencias hacia adentro y permite testear
 * casos de uso con repositorios fake.
 */

export interface TaskRecord {
  id: string;
  organizationId: string;
  teamId: string;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  assigneeId: string | null;
  createdById: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: Date | null;
  definitionOfDone: string | null;
}

export interface WorklogRecord {
  id: string;
  organizationId: string;
  authorId: string;
  taskId: string | null;
  type: WorklogType;
  status: WorklogStatus;
  title: string;
  content: string;
}

export interface AgendaEventRecord {
  id: string;
  organizationId: string;
  userId: string;
  type: AgendaEventType;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  taskId: string | null;
}

export interface TaskRepository {
  findById(id: string): Promise<TaskRecord | null>;
  listByAssignee(organizationId: string, assigneeId: string): Promise<TaskRecord[]>;
  create(input: Omit<TaskRecord, 'id'>): Promise<TaskRecord>;
  update(id: string, patch: Partial<TaskRecord>): Promise<TaskRecord>;
}

export interface WorklogRepository {
  create(input: Omit<WorklogRecord, 'id'>): Promise<WorklogRecord>;
  publish(id: string, approvedById: string): Promise<WorklogRecord>;
}

export interface AgendaRepository {
  listForUser(
    organizationId: string,
    userId: string,
    range: { from: Date; to: Date },
  ): Promise<AgendaEventRecord[]>;
}

/** Registro de auditoría ética: solo cambios de objetos de trabajo. */
export interface AuditLogger {
  record(event: {
    organizationId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}
