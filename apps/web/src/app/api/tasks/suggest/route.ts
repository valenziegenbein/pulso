import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@pulso/database';
import { canCreateTaskForTeam, isOrgAdmin, PERMISSIONS } from '@pulso/domain';
import { fallbackTaskSuggestion } from '@pulso/llm';
import { taskSuggestionRequestSchema, taskSuggestionSchema } from '@pulso/shared';
import { getAuthContext, hasPermission } from '@/lib/auth/context';
import { getTaskSuggestionService } from '@/lib/llm';
import { rateLimit } from '@/lib/rate-limit';
import { assertTeamAccess, getAuthorizedUser, isAuthorizationError, requireUserInOrg } from '@/server/authz';
import { PayloadTooLargeError, readJsonBody } from '@/server/http';

const LIMIT = Number(process.env.TASK_SUGGEST_RATE_LIMIT ?? 20);
const WINDOW_MS = Number(process.env.TASK_SUGGEST_RATE_WINDOW_MS ?? 60_000);
const ACTIVE_STATUSES = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW'];

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasPermission(ctx, PERMISSIONS.TASK_CREATE)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const limit = rateLimit(`task-suggest:${ctx.user.id}`, { limit: LIMIT, windowMs: WINDOW_MS });
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(Math.ceil((limit.retryAfterMs ?? 0) / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(req, 64 * 1024);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    throw error;
  }
  const parsed = taskSuggestionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const actor = await getAuthorizedUser(ctx);
  const team = input.teamId
    ? await assertTeamAccess(ctx, input.teamId).catch((error: unknown) => {
        if (isAuthorizationError(error)) return null;
        throw error;
      })
    : await prisma.team.findFirst({
        where: {
          organizationId: ctx.organizationId,
          ...(isOrgAdmin(actor) ? {} : { id: { in: actor.teamIds } }),
        },
        orderBy: { createdAt: 'asc' },
      });
  if (!team || !canCreateTaskForTeam(actor, team)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (input.assigneeId) {
    try {
      await requireUserInOrg(ctx, input.assigneeId, team.id);
    } catch (error) {
      if (isAuthorizationError(error)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      throw error;
    }
  }

  const [memberships, activeTasks] = await Promise.all([
    prisma.orgMembership.findMany({
      where: {
        organizationId: ctx.organizationId,
        user: { teamMemberships: { some: { teamId: team.id } } },
      },
      include: {
        user: {
          include: {
            teamMemberships: { where: { teamId: team.id }, include: { team: true } },
            assignedTasks: {
              where: { organizationId: ctx.organizationId, status: { in: ACTIVE_STATUSES } },
              select: { id: true },
            },
          },
        },
        role: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.task.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: { in: ACTIVE_STATUSES },
        teamId: team.id,
      },
      include: { assignee: true },
      orderBy: { updatedAt: 'desc' },
      take: 12,
    }),
  ]);

  const suggestionInput = {
    instruction: input.instruction,
    organizationName: ctx.organizationName,
    team: team ? { id: team.id, name: team.name, description: team.description, focus: team.focus } : undefined,
    assigneeId: input.assigneeId,
    members: memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      role: m.role.key,
      teamIds: m.user.teamMemberships.map((tm) => tm.teamId),
      activeTasks: m.user.assignedTasks.length,
    })),
    activeTasks: activeTasks.map((task) => ({
      title: task.title,
      assigneeName: task.assignee?.name,
      priority: task.priority,
      status: task.status,
    })),
  };

  try {
    const suggestion = await (await getTaskSuggestionService(ctx.organizationId)).suggest(suggestionInput);
    return NextResponse.json({ suggestion: taskSuggestionSchema.parse(suggestion), source: 'llm' });
  } catch {
    return NextResponse.json({ suggestion: taskSuggestionSchema.parse(fallbackTaskSuggestion(suggestionInput)), source: 'local' });
  }
}
