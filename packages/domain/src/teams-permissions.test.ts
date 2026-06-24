import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS } from './permissions';
import {
  canCreateTaskForTeam,
  canCreateWorklogForTarget,
  canInviteRoleToTeam,
  canManageTask,
  canResolveDecision,
  type TeamPermissionUser,
} from './teams-permissions';

const orgAdmin: TeamPermissionUser = {
  id: 'maria',
  role: 'ORG_ADMIN',
  permissions: DEFAULT_ROLE_PERMISSIONS.ORG_ADMIN,
  teamIds: [],
};

const teamAdmin: TeamPermissionUser = {
  id: 'luis',
  role: 'TEAM_ADMIN',
  permissions: DEFAULT_ROLE_PERMISSIONS.TEAM_ADMIN,
  teamIds: ['ops'],
};

const member: TeamPermissionUser = {
  id: 'ana',
  role: 'MEMBER',
  permissions: DEFAULT_ROLE_PERMISSIONS.MEMBER,
  teamIds: ['product'],
};

describe('team ownership permissions', () => {
  it('permite a ORG_ADMIN escribir en cualquier equipo de su organizacion', () => {
    expect(canCreateTaskForTeam(orgAdmin, { id: 'any-team' })).toBe(true);
    expect(canManageTask(orgAdmin, { teamId: 'any-team', assigneeId: 'other' })).toBe(true);
    expect(canResolveDecision(orgAdmin, { teamId: 'any-team' })).toBe(true);
  });

  it('limita a TEAM_ADMIN a sus equipos', () => {
    expect(canCreateTaskForTeam(teamAdmin, { id: 'ops' })).toBe(true);
    expect(canCreateTaskForTeam(teamAdmin, { id: 'product' })).toBe(false);
    expect(canResolveDecision(teamAdmin, { teamId: 'ops' })).toBe(true);
    expect(canResolveDecision(teamAdmin, { teamId: 'product' })).toBe(false);
  });

  it('permite a MEMBER registrar trabajo solo en tareas asignadas', () => {
    expect(canCreateWorklogForTarget(member, { teamId: 'product', assigneeId: 'ana' })).toBe(true);
    expect(canCreateWorklogForTarget(member, { teamId: 'product', assigneeId: 'carla' })).toBe(false);
    expect(canManageTask(member, { teamId: 'product', assigneeId: 'ana' })).toBe(true);
    expect(canManageTask(member, { teamId: 'product', assigneeId: 'carla' })).toBe(false);
  });

  it('evita que TEAM_ADMIN invite admins de organizacion', () => {
    expect(canInviteRoleToTeam(teamAdmin, 'MEMBER', 'ops')).toBe(true);
    expect(canInviteRoleToTeam(teamAdmin, 'TEAM_ADMIN', 'ops')).toBe(true);
    expect(canInviteRoleToTeam(teamAdmin, 'ORG_ADMIN', 'ops')).toBe(false);
    expect(canInviteRoleToTeam(teamAdmin, 'MEMBER', 'product')).toBe(false);
  });
});
