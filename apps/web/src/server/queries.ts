import { prisma } from '@pulso/database';
import { buildWorkloadSnapshot, evaluateOverload, type TaskLike } from '@pulso/domain';
import type { TaskPriority, TaskStatus } from '@pulso/shared';
import type { AuthContext } from '@/lib/auth/context';

const ACTIVE_STATUSES = { notIn: ['DONE', 'CANCELLED'] as TaskStatus[] };

// SQLite guarda status/priority como String; casteamos al cruzar a dominio.
function toTaskLike(t: { status: string; priority: string; dueDate: Date | null; definitionOfDone: string | null }): TaskLike {
  return {
    status: t.status as TaskStatus,
    priority: t.priority as TaskPriority,
    dueDate: t.dueDate,
    definitionOfDone: t.definitionOfDone,
  };
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getPersonalDashboard(ctx: AuthContext) {
  const [tasks, agenda, worklog] = await Promise.all([
    prisma.task.findMany({
      where: { organizationId: ctx.organizationId, assigneeId: ctx.user.id, status: ACTIVE_STATUSES },
      include: { team: true, blockers: { where: { resolvedAt: null } } },
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    }),
    prisma.agendaEvent.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.user.id, startsAt: { gte: startOfToday() } },
      orderBy: { startsAt: 'asc' },
      take: 6,
    }),
    prisma.worklogEntry.findMany({
      where: { organizationId: ctx.organizationId, authorId: ctx.user.id },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
  ]);

  const overload = evaluateOverload(buildWorkloadSnapshot(tasks.map(toTaskLike)));
  return { tasks, agenda, worklog, overload };
}

export async function getAdminDashboard(ctx: AuthContext) {
  const org = ctx.organizationId;
  const activeWhere = { organizationId: org, status: ACTIVE_STATUSES };

  const [byStatusRaw, members, openBlockers, unassigned, withoutDoD, overdue, decisions] = await Promise.all([
    prisma.task.groupBy({ by: ['status'], where: { organizationId: org }, _count: true }),
    prisma.orgMembership.findMany({ where: { organizationId: org }, include: { user: true, role: true } }),
    prisma.blocker.findMany({
      where: { resolvedAt: null, task: { organizationId: org } },
      include: { task: true },
      take: 10,
    }),
    prisma.task.findMany({ where: { ...activeWhere, assigneeId: null }, include: { team: true } }),
    prisma.task.findMany({ where: { ...activeWhere, definitionOfDone: null }, include: { team: true } }),
    prisma.task.findMany({
      where: { ...activeWhere, dueDate: { lt: new Date() } },
      include: { team: true, assignee: true },
    }),
    prisma.worklogEntry.findMany({
      where: { organizationId: org, type: 'DECISION', status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  // Carga por persona (con nivel de sobrecarga).
  const perPerson = await Promise.all(
    members.map(async (m) => {
      const personTasks = await prisma.task.findMany({
        where: { organizationId: org, assigneeId: m.userId },
        select: { status: true, priority: true, dueDate: true, definitionOfDone: true },
      });
      const overload = evaluateOverload(buildWorkloadSnapshot(personTasks.map(toTaskLike)));
      const active = personTasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED').length;
      return { user: m.user, role: m.role.key, active, level: overload.level };
    }),
  );

  const byStatus = Object.fromEntries(byStatusRaw.map((r) => [r.status, r._count])) as Record<TaskStatus, number>;
  return { byStatus, perPerson, openBlockers, unassigned, withoutDoD, overdue, decisions };
}

export async function getTaskList(ctx: AuthContext) {
  return prisma.task.findMany({
    where: { organizationId: ctx.organizationId },
    include: { team: true, assignee: true },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  });
}

export async function getTaskDetail(ctx: AuthContext, id: string) {
  const task = await prisma.task.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      team: true,
      assignee: true,
      blockers: { orderBy: { createdAt: 'desc' } },
      comments: { include: { author: true }, orderBy: { createdAt: 'asc' } },
      worklogEntries: { orderBy: { createdAt: 'desc' } },
      subtasks: true,
    },
  });
  if (!task) return null;
  const people = await getAssignablePeople(ctx);
  return { task, people };
}

export async function getAssignablePeople(ctx: AuthContext) {
  const members = await prisma.orgMembership.findMany({
    where: { organizationId: ctx.organizationId },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });
  return members.map((m) => ({ id: m.user.id, name: m.user.name }));
}

/** Foco actual para el widget: tareas activas propias + su última bitácora. */
export async function getWidgetFocus(ctx: AuthContext) {
  const tasks = await prisma.task.findMany({
    where: { organizationId: ctx.organizationId, assigneeId: ctx.user.id, status: ACTIVE_STATUSES },
    include: {
      team: true,
      worklogEntries: { orderBy: { createdAt: 'desc' }, take: 1 },
      blockers: { where: { resolvedAt: null } },
    },
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    take: 4,
  });
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    teamName: t.team.name,
    blocked: t.blockers.length > 0,
    lastNote: t.worklogEntries[0]?.title ?? null,
  }));
}

export async function getTeamsPage(ctx: AuthContext) {
  const [teams, members] = await Promise.all([
    prisma.team.findMany({
      where: { organizationId: ctx.organizationId },
      include: { parent: true, _count: { select: { tasks: true, memberships: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.orgMembership.findMany({
      where: { organizationId: ctx.organizationId },
      include: { user: true, role: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  return { teams, members };
}
