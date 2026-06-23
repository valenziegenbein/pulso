import type { RoleKey } from '@pulso/shared';
import { can, PERMISSIONS, type Permission } from './permissions';

export interface TeamPermissionUser {
  id: string;
  role: RoleKey;
  permissions: readonly Permission[];
  teamIds?: readonly string[];
}

export interface TeamPermissionTarget {
  id?: string | null;
  teamId?: string | null;
  authorId?: string | null;
}

export function isOrgAdmin(user: TeamPermissionUser): boolean {
  return user.role === 'SUPER_ADMIN' || user.role === 'ORG_ADMIN';
}

export function isTeamAdmin(user: TeamPermissionUser, teamId?: string | null): boolean {
  if (isOrgAdmin(user)) return true;
  if (user.role !== 'TEAM_ADMIN') return false;
  if (!teamId) return true;
  return user.teamIds?.includes(teamId) ?? false;
}

export function canCreateTeam(user: TeamPermissionUser): boolean {
  return can(user.permissions, PERMISSIONS.TEAM_CREATE);
}

export function canAssignTask(user: TeamPermissionUser, team?: TeamPermissionTarget | null): boolean {
  if (!can(user.permissions, PERMISSIONS.TASK_ASSIGN)) return false;
  return isOrgAdmin(user) || isTeamAdmin(user, team?.id ?? team?.teamId ?? null);
}

export function canViewTeam(user: TeamPermissionUser, team?: TeamPermissionTarget | null): boolean {
  if (isOrgAdmin(user)) return true;
  const teamId = team?.id ?? team?.teamId ?? null;
  if (!teamId) return can(user.permissions, PERMISSIONS.DASHBOARD_VIEW);
  return user.teamIds?.includes(teamId) ?? false;
}

export function canManageMember(user: TeamPermissionUser, member?: TeamPermissionTarget | null): boolean {
  if (!can(user.permissions, PERMISSIONS.PERSON_INVITE)) return false;
  return isOrgAdmin(user) || isTeamAdmin(user, member?.teamId ?? null);
}

export function canApproveWorklog(user: TeamPermissionUser, entry: TeamPermissionTarget): boolean {
  if (entry.authorId === user.id) return true;
  if (!can(user.permissions, PERMISSIONS.WORKLOG_APPROVE)) return false;
  return isOrgAdmin(user) || isTeamAdmin(user, entry.teamId ?? null);
}
