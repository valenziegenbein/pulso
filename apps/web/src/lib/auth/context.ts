import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@pulso/database';
import { ALL_PERMISSIONS, type Permission } from '@pulso/domain';
import type { RoleKey } from '@pulso/shared';
import { SESSION_COOKIE } from './constants';
import { verifySessionToken } from './session';

export interface AuthContext {
  user: { id: string; name: string; email: string };
  organizationId: string;
  organizationName: string;
  role: RoleKey;
  permissions: Permission[];
}

/** Carga el contexto del usuario autenticado, o null si no hay sesión válida. */
export async function getAuthContext(): Promise<AuthContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = verifySessionToken(token);
  if (!session) return null;

  // MVP: una persona pertenece a una organización (la primera membresía).
  const membership = await prisma.orgMembership.findFirst({
    where: { userId: session.userId },
    include: { user: true, role: true, organization: true },
  });
  if (!membership) return null;

  const permissions = membership.user.isSuperAdmin
    ? ALL_PERMISSIONS
    : (safeParsePermissions(membership.role.permissions));

  return {
    user: { id: membership.user.id, name: membership.user.name, email: membership.user.email },
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    role: membership.role.key as RoleKey,
    permissions,
  };
}

/** Igual que getAuthContext pero redirige a /login si no hay sesión. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  return ctx;
}

export function hasPermission(ctx: AuthContext, permission: Permission): boolean {
  return ctx.permissions.includes(permission);
}

/** Los permisos del rol se guardan como JSON (SQLite no soporta String[]). */
function safeParsePermissions(value: string): Permission[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? (parsed as Permission[]) : [];
  } catch {
    return [];
  }
}
