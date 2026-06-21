import type { RoleKey } from '@pulso/shared';

/**
 * RBAC simple basado en permisos atómicos.
 *
 * Los roles del sistema se siembran como filas `Role` con su lista de
 * `permissions` (ver seed). Esta matriz es la fuente de verdad por defecto:
 * el seed la usa y la app la consulta. Permite además "roles rápidos"
 * personalizados editando la lista de permisos de un Role.
 */

export const PERMISSIONS = {
  TEAM_CREATE: 'team.create',
  TEAM_CREATE_SUB: 'team.createSub',
  PERSON_INVITE: 'person.invite',
  ROLE_ASSIGN: 'role.assign',
  TASK_CREATE: 'task.create',
  TASK_ASSIGN: 'task.assign',
  TASK_EDIT: 'task.edit',
  TASK_CLOSE: 'task.close',
  AGENDA_VIEW_OWN: 'agenda.viewOwn',
  AGENDA_VIEW_TEAM: 'agenda.viewTeam',
  DASHBOARD_VIEW: 'dashboard.view',
  DASHBOARD_VIEW_ADMIN: 'dashboard.viewAdmin',
  LLM_CONFIGURE: 'llm.configure',
  WORKLOG_APPROVE: 'worklog.approve',
  WORKLOG_VIEW_OTHERS: 'worklog.viewOthers',
  AUDIT_VIEW: 'audit.view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/**
 * Matriz de permisos por rol. SUPER_ADMIN obtiene todo.
 *
 * Nota de privacidad: WORKLOG_VIEW_OTHERS solo da acceso a entradas
 * PUBLICADAS. Los borradores son siempre privados de su autor.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ORG_ADMIN: [
    PERMISSIONS.TEAM_CREATE,
    PERMISSIONS.TEAM_CREATE_SUB,
    PERMISSIONS.PERSON_INVITE,
    PERMISSIONS.ROLE_ASSIGN,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.TASK_EDIT,
    PERMISSIONS.TASK_CLOSE,
    PERMISSIONS.AGENDA_VIEW_OWN,
    PERMISSIONS.AGENDA_VIEW_TEAM,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.DASHBOARD_VIEW_ADMIN,
    PERMISSIONS.LLM_CONFIGURE,
    PERMISSIONS.WORKLOG_APPROVE,
    PERMISSIONS.WORKLOG_VIEW_OTHERS,
    PERMISSIONS.AUDIT_VIEW,
  ],
  TEAM_ADMIN: [
    PERMISSIONS.TEAM_CREATE_SUB,
    PERMISSIONS.PERSON_INVITE,
    PERMISSIONS.ROLE_ASSIGN,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.TASK_EDIT,
    PERMISSIONS.TASK_CLOSE,
    PERMISSIONS.AGENDA_VIEW_OWN,
    PERMISSIONS.AGENDA_VIEW_TEAM,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.DASHBOARD_VIEW_ADMIN,
    PERMISSIONS.WORKLOG_APPROVE,
    PERMISSIONS.WORKLOG_VIEW_OTHERS,
    PERMISSIONS.AUDIT_VIEW,
  ],
  COORDINATOR: [
    PERMISSIONS.TEAM_CREATE_SUB,
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.TASK_EDIT,
    PERMISSIONS.TASK_CLOSE,
    PERMISSIONS.AGENDA_VIEW_OWN,
    PERMISSIONS.AGENDA_VIEW_TEAM,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.DASHBOARD_VIEW_ADMIN,
    PERMISSIONS.WORKLOG_APPROVE,
    PERMISSIONS.WORKLOG_VIEW_OTHERS,
  ],
  MEMBER: [
    PERMISSIONS.TASK_CREATE,
    PERMISSIONS.TASK_EDIT, // solo propias (se valida ownership en el caso de uso)
    PERMISSIONS.TASK_CLOSE, // solo propias
    PERMISSIONS.AGENDA_VIEW_OWN,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.WORKLOG_APPROVE, // solo su propia bitácora
  ],
  VIEWER: [
    PERMISSIONS.AGENDA_VIEW_OWN,
    PERMISSIONS.AGENDA_VIEW_TEAM,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.WORKLOG_VIEW_OTHERS,
  ],
};

/** ¿El conjunto de permisos incluye el permiso pedido? */
export function can(permissions: readonly Permission[], permission: Permission): boolean {
  return permissions.includes(permission);
}

/** Permisos efectivos por defecto de un rol del sistema. */
export function permissionsForRole(role: RoleKey): Permission[] {
  return DEFAULT_ROLE_PERMISSIONS[role];
}
