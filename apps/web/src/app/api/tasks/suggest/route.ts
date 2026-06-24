import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@pulso/database';
import { PERMISSIONS } from '@pulso/domain';
import { fallbackTaskSuggestion } from '@pulso/llm';
import { taskSuggestionRequestSchema, taskSuggestionSchema } from '@pulso/shared';
import { getAuthContext, hasPermission } from '@/lib/auth/context';
import { getTaskSuggestionService } from '@/lib/llm';
import { rateLimit } from '@/lib/rate-limit';

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

  const body = await req.json().catch(() => null);
  const parsed = taskSuggestionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const [team, memberships, activeTasks] = await Promise.all([
    input.teamId
      ? prisma.team.findFirst({ where: { id: input.teamId, organizationId: ctx.organizationId } })
      : prisma.team.findFirst({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: 'asc' } }),
    prisma.orgMembership.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        user: {
          include: {
            teamMemberships: { include: { team: true } },
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
        ...(input.teamId ? { teamId: input.teamId } : {}),
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
