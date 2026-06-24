import { prisma } from '@pulso/database';
import type { RoleKey } from '@pulso/shared';
import type { AuthContext } from '@/lib/auth/context';

export interface AuthorizedUser {
  id: string;
  role: AuthContext['role'];
  permissions: AuthContext['permissions'];
  teamIds: string[];
}

export class AuthorizationError extends Error {
  constructor(message = 'Sin permiso para realizar esta accion.') {
    super(message);
    this.name = 'AuthorizationError';
  }
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
    teamIds: memberships.map((m) => m.teamId),
  };
}

export async function requireTeamInOrg(ctx: AuthContext, teamId: string) {
  const team = await prisma.team.findFirst({ where: { id: teamId, organizationId: ctx.organizationId } });
  if (!team) throw new AuthorizationError('Equipo no encontrado.');
  return team;
}

export async function requireTaskInOrg(ctx: AuthContext, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, organizationId: ctx.organizationId } });
  if (!task) throw new AuthorizationError('Tarea no encontrada.');
  return task;
}

export async function requireDecisionInOrg(ctx: AuthContext, decisionId: string) {
  const decision = await prisma.decisionRequest.findFirst({
    where: { id: decisionId, organizationId: ctx.organizationId },
  });
  if (!decision) throw new AuthorizationError('Decision no encontrada.');
  return decision;
}

export async function requireWorklogInOrg(ctx: AuthContext, worklogId: string) {
  const entry = await prisma.worklogEntry.findFirst({ where: { id: worklogId, organizationId: ctx.organizationId } });
  if (!entry) throw new AuthorizationError('Entrada no encontrada.');
  return entry;
}

export async function requireUserInOrg(ctx: AuthContext, userId: string) {
  const membership = await prisma.orgMembership.findFirst({
    where: { organizationId: ctx.organizationId, userId },
    include: { user: true, role: true },
  });
  if (!membership) throw new AuthorizationError('Persona no encontrada en la organizacion.');
  return membership;
}

export async function requireRoleInOrg(ctx: AuthContext, roleKey: RoleKey) {
  const role = await prisma.role.findUnique({
    where: { organizationId_key: { organizationId: ctx.organizationId, key: roleKey } },
  });
  if (!role) throw new AuthorizationError('Rol no encontrado.');
  return role;
}

export async function countOrgMembers(organizationId: string): Promise<number> {
  return prisma.orgMembership.count({ where: { organizationId } });
}

export function assertAllowed(allowed: boolean, message?: string): void {
  if (!allowed) throw new AuthorizationError(message);
}
