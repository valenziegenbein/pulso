import { prisma } from '@pulso/database';
import { buildWorkloadSnapshot, evaluateOverload, isOrgAdmin, type TaskLike } from '@pulso/domain';
import type { TaskPriority, TaskStatus } from '@pulso/shared';
import type { AuthContext } from '@/lib/auth/context';
import {
  assertAllowed,
  assertTaskAccess,
  assertTeamAccess,
  getAuthorizedUser,
  isAuthorizationError,
  type AuthorizedUser,
} from '@/server/authz';

const ACTIVE_STATUSES = { notIn: ['DONE', 'CANCELLED'] as TaskStatus[] };
const ACTIVE_STATUS_LIST = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'] as TaskStatus[];

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

function worklogVisibilityFilter(ctx: AuthContext, actor: AuthorizedUser) {
  const or: Array<Record<string, unknown>> = [{ authorId: ctx.user.id }];
  if (actor.permissions.includes('worklog.viewOthers')) or.push({ status: 'PUBLISHED' });
  if (actor.permissions.includes('worklog.approve') && (isOrgAdmin(actor) || actor.role === 'TEAM_ADMIN')) {
    or.push({ status: 'DRAFT' });
  }
  return { OR: or };
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

export async function getMemberDashboard(ctx: AuthContext) {
  const data = await getPersonalDashboard(ctx);
  const openBlockers = await prisma.blocker.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: 'OPEN',
      OR: [{ createdById: ctx.user.id }, { task: { assigneeId: ctx.user.id, organizationId: ctx.organizationId } }],
    },
    include: { task: { include: { team: true } } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  const decisions = await prisma.decisionRequest.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: 'OPEN',
      OR: [{ requestedById: ctx.user.id }, { task: { assigneeId: ctx.user.id } }],
    },
    include: { task: true, team: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  return { ...data, openBlockers, decisions };
}

export async function getAdminDashboard(ctx: AuthContext) {
  const actor = await getAuthorizedUser(ctx);
  assertAllowed(isOrgAdmin(actor));
  const org = ctx.organizationId;
  const activeWhere = { organizationId: org, status: ACTIVE_STATUSES };

  const [byStatusRaw, teams, members, openBlockers, unassigned, withoutDoD, overdue, decisions, recentWorklog] = await Promise.all([
    prisma.task.groupBy({ by: ['status'], where: { organizationId: org }, _count: true }),
    prisma.team.findMany({
      where: { organizationId: org },
      include: {
        tasks: {
          where: { status: ACTIVE_STATUSES },
          include: {
            assignee: true,
            blockers: { where: { status: 'OPEN' } },
            worklogEntries: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
          orderBy: { updatedAt: 'desc' },
        },
        decisions: { where: { status: 'OPEN' } },
        blockers: { where: { status: 'OPEN' } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.orgMembership.findMany({
      where: { organizationId: org },
      include: {
        user: {
          include: {
            teamMemberships: {
              where: { team: { organizationId: org } },
              include: { team: true },
            },
          },
        },
        role: true,
      },
    }),
    prisma.blocker.findMany({
      where: { status: 'OPEN', OR: [{ organizationId: org }, { task: { organizationId: org } }] },
      include: { task: { include: { team: true } }, team: true, createdBy: true },
      take: 10,
    }),
    prisma.task.findMany({ where: { ...activeWhere, assigneeId: null }, include: { team: true } }),
    prisma.task.findMany({ where: { ...activeWhere, definitionOfDone: null }, include: { team: true } }),
    prisma.task.findMany({
      where: { ...activeWhere, dueDate: { lt: new Date() } },
      include: { team: true, assignee: true },
    }),
    prisma.decisionRequest.findMany({
      where: { organizationId: org, status: 'OPEN' },
      include: { team: true, task: true, requestedBy: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.worklogEntry.findMany({
      where: { organizationId: org, status: 'PUBLISHED' },
      include: { task: { include: { team: true } }, author: true, team: true },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
  ]);

  // Carga por persona (con nivel de sobrecarga).
  // Antes: una query por miembro (N+1, mortal con cientos de personas).
  // Ahora: UNA query con todas las tareas asignadas de la org y agrupamos en memoria.
  type PersonTask = { status: string; priority: string; dueDate: Date | null; definitionOfDone: string | null };
  const assignedTasks = await prisma.task.findMany({
    where: { organizationId: org, assigneeId: { not: null } },
    select: { assigneeId: true, status: true, priority: true, dueDate: true, definitionOfDone: true },
  });
  const tasksByAssignee = new Map<string, PersonTask[]>();
  for (const t of assignedTasks) {
    if (!t.assigneeId) continue;
    const arr = tasksByAssignee.get(t.assigneeId);
    if (arr) arr.push(t);
    else tasksByAssignee.set(t.assigneeId, [t]);
  }
  const perPerson = members.map((m) => {
    const personTasks = tasksByAssignee.get(m.userId) ?? [];
    const overload = evaluateOverload(buildWorkloadSnapshot(personTasks.map(toTaskLike)));
    const active = personTasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED').length;
    const high = personTasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED' && t.priority === 'HIGH').length;
    const blocked = personTasks.filter((t) => t.status === 'BLOCKED').length;
    return { user: m.user, role: m.role.key, active, high, blocked, level: overload.level, teams: m.user.teamMemberships.map((tm) => tm.team) };
  });

  const byStatus = Object.fromEntries(byStatusRaw.map((r) => [r.status, r._count])) as Record<TaskStatus, number>;
  return { byStatus, teams, perPerson, openBlockers, unassigned, withoutDoD, overdue, decisions, recentWorklog };
}

export async function getOrganizationSettings(ctx: AuthContext) {
  const [org, usedSeats, llm] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { planKey: true, seatLimit: true },
    }),
    prisma.orgMembership.count({ where: { organizationId: ctx.organizationId } }),
    prisma.lLMProviderConfig.findFirst({
      where: { organizationId: ctx.organizationId, isActive: true },
      orderBy: { updatedAt: 'desc' },
      select: { providerType: true, baseUrl: true, model: true, apiKeyEncrypted: true, updatedAt: true },
    }),
  ]);
  return {
    planKey: org?.planKey ?? 'FREE',
    seatLimit: org?.seatLimit ?? 5,
    usedSeats,
    llm: llm
      ? {
          providerType: llm.providerType,
          baseUrl: llm.baseUrl,
          model: llm.model,
          hasApiKey: Boolean(llm.apiKeyEncrypted),
          updatedAt: llm.updatedAt,
        }
      : null,
  };
}

export async function getTaskList(ctx: AuthContext) {
  const visibleTeamIds = await getVisibleTeamIds(ctx);
  return prisma.task.findMany({
    where: { organizationId: ctx.organizationId, ...(visibleTeamIds ? { teamId: { in: visibleTeamIds } } : {}) },
    include: {
      team: true,
      assignee: true,
      worklogEntries: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    // Guard de volumen: a esta escala el usuario filtra por equipo/estado.
    take: 1000,
  });
}

/**
 * Tablero de Tareas: proyectos (tareas de nivel superior, con sus sub-tareas) +
 * las sub-tareas activas (el trabajo granular en curso). Una tarea con subtareas
 * se comporta como un proyecto.
 */
export async function getTasksBoard(ctx: AuthContext) {
  const visibleTeamIds = await getVisibleTeamIds(ctx);
  const scope = { organizationId: ctx.organizationId, ...(visibleTeamIds ? { teamId: { in: visibleTeamIds } } : {}) };
  const [projects, activeTasks] = await Promise.all([
    prisma.task.findMany({
      where: { ...scope, parentTaskId: null },
      include: {
        team: true,
        assignee: { select: { id: true, name: true } },
        subtasks: { select: { id: true, status: true, assignee: { select: { id: true, name: true } } } },
        blockers: { where: { status: 'OPEN' }, select: { id: true } },
        worklogEntries: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, take: 1, select: { title: true } },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 200,
    }),
    prisma.task.findMany({
      where: { ...scope, parentTaskId: { not: null }, status: ACTIVE_STATUSES },
      include: { assignee: { select: { name: true } }, parent: { select: { id: true, title: true } } },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    }),
  ]);
  return { projects, activeTasks };
}

export async function getTaskDetail(ctx: AuthContext, id: string) {
  const accessibleTask = await assertTaskAccess(ctx, id).catch((error: unknown) => {
    if (isAuthorizationError(error)) return null;
    throw error;
  });
  if (!accessibleTask) return null;
  const actor = await getAuthorizedUser(ctx);
  const task = await prisma.task.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      team: true,
      assignee: true,
      blockers: { orderBy: { createdAt: 'desc' } },
      decisions: { include: { requestedBy: true }, orderBy: { createdAt: 'desc' } },
      comments: { include: { author: true }, orderBy: { createdAt: 'asc' } },
      worklogEntries: {
        where: worklogVisibilityFilter(ctx, actor),
        include: { author: true },
        orderBy: { createdAt: 'desc' },
      },
      subtasks: { include: { assignee: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!task) return null;
  const people = await getAssignablePeople(ctx, accessibleTask.teamId);
  return { task, people };
}

export async function getAssignablePeople(ctx: AuthContext, teamId?: string) {
  const actor = await getAuthorizedUser(ctx);
  if (teamId) await assertTeamAccess(ctx, teamId);
  const visibleTeamIds = isOrgAdmin(actor) ? null : actor.teamIds;
  const members = await prisma.orgMembership.findMany({
    where: { organizationId: ctx.organizationId },
    include: {
      user: {
        include: {
          teamMemberships: {
            where: {
              team: { organizationId: ctx.organizationId },
              ...(teamId ? { teamId } : visibleTeamIds ? { teamId: { in: visibleTeamIds } } : {}),
            },
            select: { teamId: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return members
    .filter((membership) => teamId
      ? membership.user.teamMemberships.length > 0
      : isOrgAdmin(actor) || membership.userId === ctx.user.id || membership.user.teamMemberships.length > 0)
    .map((membership) => ({ id: membership.user.id, name: membership.user.name }));
}

/** Foco actual para el widget: tareas activas propias + su última bitácora. */
export async function getWidgetFocus(ctx: AuthContext) {
  const now = Date.now();
  const newTaskCutoff = now - 72 * 60 * 60 * 1000;
  const recentAssignmentCutoff = now - 48 * 60 * 60 * 1000;
  const tasks = await prisma.task.findMany({
    where: { organizationId: ctx.organizationId, assigneeId: ctx.user.id, status: ACTIVE_STATUSES },
    include: {
      team: true,
      worklogEntries: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, take: 1 },
      blockers: { where: { status: 'OPEN' } },
    },
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    take: 4,
  });
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    teamId: t.teamId,
    teamName: t.team.name,
    blocked: t.blockers.length > 0,
    lastNote: t.worklogEntries[0]?.title ?? null,
    notificationLabel: t.createdAt.getTime() >= newTaskCutoff
      ? ('nueva' as const)
      : t.updatedAt.getTime() >= recentAssignmentCutoff && t.worklogEntries.length === 0
        ? ('reciente' as const)
        : null,
  }));
}

export async function getTeamsPage(ctx: AuthContext) {
  const visibleTeamIds = await getVisibleTeamIds(ctx);
  const [teams, members] = await Promise.all([
    prisma.team.findMany({
      where: { organizationId: ctx.organizationId, ...(visibleTeamIds ? { id: { in: visibleTeamIds } } : {}) },
      include: {
        parent: true,
        memberships: { include: { user: true, role: true } },
        tasks: {
          where: { status: ACTIVE_STATUSES },
          include: {
            assignee: true,
            blockers: { where: { status: 'OPEN' } },
            worklogEntries: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
          orderBy: { updatedAt: 'desc' },
        },
        blockers: { where: { status: 'OPEN' } },
        decisions: { where: { status: 'OPEN' } },
        worklogEntries: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, take: 3 },
        _count: { select: { tasks: true, memberships: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.orgMembership.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        user: {
          include: {
            teamMemberships: {
              where: {
                team: { organizationId: ctx.organizationId },
                ...(visibleTeamIds ? { teamId: { in: visibleTeamIds } } : {}),
              },
              include: { team: true },
            },
            assignedTasks: {
              where: {
                organizationId: ctx.organizationId,
                ...(visibleTeamIds ? { teamId: { in: visibleTeamIds } } : {}),
              },
            },
          },
        },
        role: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  return {
    teams,
    members: visibleTeamIds
      ? members.filter((member) => member.userId === ctx.user.id || member.user.teamMemberships.length > 0)
      : members,
  };
}

export async function getMembersPage(ctx: AuthContext) {
  const visibleTeamIds = await getVisibleTeamIds(ctx);
  const memberships = await prisma.orgMembership.findMany({
    where: { organizationId: ctx.organizationId },
    include: {
      role: true,
      user: {
        include: {
          teamMemberships: {
            where: { team: { organizationId: ctx.organizationId } },
            include: { team: true, role: true },
          },
          assignedTasks: {
            where: {
              organizationId: ctx.organizationId,
              ...(visibleTeamIds ? { teamId: { in: visibleTeamIds } } : {}),
            },
            include: { team: true, blockers: { where: { status: 'OPEN' } }, worklogEntries: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, take: 1 } },
          },
          authoredWorklogs: {
            where: {
              organizationId: ctx.organizationId,
              status: 'PUBLISHED',
              ...(visibleTeamIds ? { teamId: { in: visibleTeamIds } } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!visibleTeamIds) return memberships;
  return memberships.filter((m) => m.user.teamMemberships.some((tm) => visibleTeamIds.includes(tm.teamId)) || m.userId === ctx.user.id);
}

export async function getTeamDetail(ctx: AuthContext, id: string) {
  try {
    await assertTeamAccess(ctx, id);
  } catch (error) {
    if (isAuthorizationError(error)) return null;
    throw error;
  }
  const actor = await getAuthorizedUser(ctx);
  return prisma.team.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      memberships: { include: { user: true, role: true } },
      tasks: {
        include: {
          assignee: true,
          blockers: { where: { status: 'OPEN' } },
          worklogEntries: { where: { status: 'PUBLISHED' }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
      },
      blockers: { where: { status: 'OPEN' }, include: { task: true, createdBy: true }, orderBy: { createdAt: 'desc' } },
      decisions: { where: { status: 'OPEN' }, include: { task: true, requestedBy: true }, orderBy: { createdAt: 'desc' } },
      worklogEntries: {
        where: worklogVisibilityFilter(ctx, actor),
        include: { author: true, task: true },
        orderBy: { createdAt: 'desc' },
        take: 8,
      },
    },
  });
}

export async function getVisibleTeamIds(ctx: AuthContext): Promise<string[] | null> {
  const actor = await getAuthorizedUser(ctx);
  return isOrgAdmin(actor) ? null : actor.teamIds;
}

export { ACTIVE_STATUS_LIST };
