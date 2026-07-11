import { prisma } from '@pulso/database';
import {
  canApproveWorklog as domainCanApproveWorklog,
  canAssignTaskInScope,
  canManageTask,
  canViewTeam,
  isOrgAdmin,
  isTeamAdmin,
} from '@pulso/domain';
import type { RoleKey } from '@pulso/shared';
import type { AuthContext } from '@/lib/auth/context';

export interface AuthorizedUser {
  id: string;
  role: AuthContext['role'];
  permissions: AuthContext['permissions'];
  teamIds: string[];
}

export interface WorklogAccessTarget {
  organizationId: string;
  authorId: string;
  teamId?: string | null;
  status: string;
}

export class AuthorizationError extends Error {
  readonly status = 404;
  readonly code = 'RESOURCE_NOT_FOUND';

  constructor(message = 'Recurso no encontrado.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export function assertOrganizationAccess(ctx: AuthContext, organizationId: string): void {
  if (organizationId !== ctx.organizationId) throw new AuthorizationError();
}

export async function getAuthorizedUser(ctx: AuthContext): Promise<AuthorizedUser> {
  const memberships = await prisma.teamMembership.findMany({
    where: { userId: ctx.user.id, team: { organizationId: ctx.organizationId } },
    select: { teamId: true },
  });
  return {
    id: ctx.user.id,
    role: ctx.role,
    permissions: ctx.permissions,
    teamIds: memberships.map((membership) => membership.teamId),
  };
}

export function canManageTeam(actor: AuthorizedUser, teamId: string): boolean {
  return isOrgAdmin(actor) || isTeamAdmin(actor, teamId);
}

export function canAssignTask(actor: AuthorizedUser, task: { teamId: string; assigneeId?: string | null }): boolean {
  return canAssignTaskInScope(actor, task);
}

export function canApproveWorklog(actor: AuthorizedUser, entry: WorklogAccessTarget): boolean {
  return domainCanApproveWorklog(actor, entry);
}

export function canViewWorklog(
  actor: AuthorizedUser,
  entry: WorklogAccessTarget,
  activeOrganizationId: string,
): boolean {
  if (entry.organizationId !== activeOrganizationId) return false;
  if (entry.authorId === actor.id) return true;
  if (entry.status === 'DRAFT') return canApproveWorklog(actor, entry);
  if (entry.status !== 'PUBLISHED') return false;
  if (!entry.teamId) return isOrgAdmin(actor);
  return canViewTeam(actor, { id: entry.teamId }) && actor.permissions.includes('worklog.viewOthers');
}

export async function assertTeamAccess(ctx: AuthContext, teamId: string, access: 'view' | 'manage' = 'view') {
  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId: ctx.organizationId },
  });
  if (!team) throw new AuthorizationError();
  const actor = await getAuthorizedUser(ctx);
  const allowed = access === 'manage' ? canManageTeam(actor, team.id) : canViewTeam(actor, team);
  if (!allowed) throw new AuthorizationError();
  return team;
}

export async function assertTaskAccess(ctx: AuthContext, taskId: string, access: 'view' | 'manage' | 'assign' = 'view') {
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId: ctx.organizationId },
  });
  if (!task) throw new AuthorizationError();
  const actor = await getAuthorizedUser(ctx);
  const allowed = access === 'manage'
    ? canManageTask(actor, task)
    : access === 'assign'
      ? canAssignTask(actor, task)
      : canViewTeam(actor, { id: task.teamId });
  if (!allowed) throw new AuthorizationError();
  return task;
}

export async function assertWorklogAccess(ctx: AuthContext, worklogId: string, access: 'view' | 'approve' = 'view') {
  const entry = await prisma.worklogEntry.findFirst({
    where: { id: worklogId, organizationId: ctx.organizationId },
  });
  if (!entry) throw new AuthorizationError();
  const actor = await getAuthorizedUser(ctx);
  const allowed = access === 'approve'
    ? canApproveWorklog(actor, entry)
    : canViewWorklog(actor, entry, ctx.organizationId);
  if (!allowed) throw new AuthorizationError();
  return entry;
}

export async function requireTeamInOrg(ctx: AuthContext, teamId: string) {
  return assertTeamAccess(ctx, teamId);
}

export async function requireTaskInOrg(ctx: AuthContext, taskId: string) {
  return assertTaskAccess(ctx, taskId);
}

export async function requireDecisionInOrg(ctx: AuthContext, decisionId: string) {
  const decision = await prisma.decisionRequest.findFirst({
    where: { id: decisionId, organizationId: ctx.organizationId },
  });
  if (!decision) throw new AuthorizationError();
  await assertTeamAccess(ctx, decision.teamId);
  return decision;
}

export async function requireWorklogInOrg(ctx: AuthContext, worklogId: string) {
  return assertWorklogAccess(ctx, worklogId);
}

export async function requireUserInOrg(ctx: AuthContext, userId: string, teamId?: string) {
  const membership = await prisma.orgMembership.findUnique({
    where: { organizationId_userId: { organizationId: ctx.organizationId, userId } },
    include: { user: true, role: true },
  });
  if (!membership) throw new AuthorizationError();

  if (teamId) {
    const teamMembership = await prisma.teamMembership.findFirst({
      where: { teamId, userId, team: { organizationId: ctx.organizationId } },
      select: { id: true },
    });
    if (!teamMembership) throw new AuthorizationError();
  }
  return membership;
}

export async function requireRoleInOrg(ctx: AuthContext, roleKey: RoleKey) {
  const role = await prisma.role.findUnique({
    where: { organizationId_key: { organizationId: ctx.organizationId, key: roleKey } },
  });
  if (!role) throw new AuthorizationError();
  return role;
}

export async function countOrgMembers(ctx: AuthContext): Promise<number> {
  return prisma.orgMembership.count({ where: { organizationId: ctx.organizationId } });
}

export function assertAllowed(allowed: boolean, message?: string): void {
  if (!allowed) throw new AuthorizationError(message);
}

export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError;
}
