import type { Task } from '@prisma/client';
import type {
  AgendaEventRecord,
  AgendaRepository,
  AuditLogger,
  TaskRecord,
  TaskRepository,
  WorklogRecord,
  WorklogRepository,
} from '@pulso/domain';
import { prisma } from './client';

/**
 * Implementaciones Prisma de los puertos de `@pulso/domain`.
 * Como SQLite guarda los "enums" como String, en los mapeos casteamos al tipo
 * de unión correspondiente (la validación real vive en @pulso/shared).
 */

function toTaskRecord(row: Task): TaskRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    teamId: row.teamId,
    parentTaskId: row.parentTaskId,
    title: row.title,
    description: row.description,
    expectedOutcome: row.expectedOutcome,
    assigneeId: row.assigneeId,
    createdById: row.createdById,
    priority: row.priority as TaskRecord['priority'],
    status: row.status as TaskRecord['status'],
    dueDate: row.dueDate,
    definitionOfDone: row.definitionOfDone,
  };
}

export class PrismaTaskRepository implements TaskRepository {
  async findById(id: string): Promise<TaskRecord | null> {
    const row = await prisma.task.findUnique({ where: { id } });
    return row ? toTaskRecord(row) : null;
  }

  async listByAssignee(organizationId: string, assigneeId: string): Promise<TaskRecord[]> {
    const rows = await prisma.task.findMany({ where: { organizationId, assigneeId } });
    return rows.map(toTaskRecord);
  }

  async create(input: Omit<TaskRecord, 'id'>): Promise<TaskRecord> {
    const row = await prisma.task.create({
      data: {
        organizationId: input.organizationId,
        teamId: input.teamId,
        parentTaskId: input.parentTaskId,
        title: input.title,
        description: input.description,
        expectedOutcome: input.expectedOutcome,
        assigneeId: input.assigneeId,
        createdById: input.createdById,
        priority: input.priority,
        status: input.status,
        dueDate: input.dueDate,
        definitionOfDone: input.definitionOfDone,
      },
    });
    return toTaskRecord(row);
  }

  async update(id: string, patch: Partial<TaskRecord>): Promise<TaskRecord> {
    const row = await prisma.task.update({
      where: { id },
      data: {
        title: patch.title,
        description: patch.description,
        expectedOutcome: patch.expectedOutcome,
        assigneeId: patch.assigneeId,
        priority: patch.priority,
        status: patch.status,
        dueDate: patch.dueDate,
        definitionOfDone: patch.definitionOfDone,
      },
    });
    return toTaskRecord(row);
  }
}

export class PrismaWorklogRepository implements WorklogRepository {
  async create(input: Omit<WorklogRecord, 'id'>): Promise<WorklogRecord> {
    const row = await prisma.worklogEntry.create({
      data: {
        organizationId: input.organizationId,
        authorId: input.authorId,
        taskId: input.taskId,
        type: input.type,
        status: input.status,
        title: input.title,
        content: input.content,
      },
    });
    return {
      id: row.id,
      organizationId: row.organizationId,
      authorId: row.authorId,
      taskId: row.taskId,
      type: row.type as WorklogRecord['type'],
      status: row.status as WorklogRecord['status'],
      title: row.title,
      content: row.content,
    };
  }

  async publish(id: string, approvedById: string): Promise<WorklogRecord> {
    const row = await prisma.worklogEntry.update({
      where: { id },
      data: { status: 'PUBLISHED', approvedById, publishedAt: new Date() },
    });
    return {
      id: row.id,
      organizationId: row.organizationId,
      authorId: row.authorId,
      taskId: row.taskId,
      type: row.type as WorklogRecord['type'],
      status: row.status as WorklogRecord['status'],
      title: row.title,
      content: row.content,
    };
  }
}

export class PrismaAgendaRepository implements AgendaRepository {
  async listForUser(
    organizationId: string,
    userId: string,
    range: { from: Date; to: Date },
  ): Promise<AgendaEventRecord[]> {
    const rows = await prisma.agendaEvent.findMany({
      where: { organizationId, userId, startsAt: { gte: range.from, lte: range.to } },
      orderBy: { startsAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      userId: row.userId,
      type: row.type as AgendaEventRecord['type'],
      title: row.title,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      taskId: row.taskId,
    }));
  }
}

export class PrismaAuditLogger implements AuditLogger {
  async record(event: {
    organizationId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await prisma.auditEvent.create({
      data: {
        organizationId: event.organizationId,
        actorId: event.actorId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      },
    });
  }
}
