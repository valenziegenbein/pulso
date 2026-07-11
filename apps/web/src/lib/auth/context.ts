import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@pulso/database';
import { ALL_PERMISSIONS, type Permission } from '@pulso/domain';
import type { RoleKey } from '@pulso/shared';
import { SESSION_COOKIE } from './constants';
import { verifySessionToken, type VerifiedSession } from './session';

export interface AuthContext {
  user: { id: string; name: string; email: string };
  organizationId: string;
  organizationName: string;
  role: RoleKey;
  permissions: Permission[];
}

export async function getSessionIdentity(): Promise<VerifiedSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
}

/** Sólo crea contexto cuando la sesión eligió explícitamente una organización. */
export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await getSessionIdentity();
  if (!session?.activeOrganizationId) return null;

  const membership = await prisma.orgMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: session.activeOrganizationId,
        userId: session.userId,
      },
    },
    include: { user: true, role: true, organization: true },
  });
  if (!membership) return null;

  const permissions = membership.user.isSuperAdmin
    ? ALL_PERMISSIONS
    : safeParsePermissions(membership.role.permissions);

  return {
    user: { id: membership.user.id, name: membership.user.name, email: membership.user.email },
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    role: membership.role.key as RoleKey,
    permissions,
  };
}

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (ctx) return ctx;
  const session = await getSessionIdentity();
  if (session && !session.activeOrganizationId) redirect('/select-organization');
  redirect('/login');
}

export function hasPermission(ctx: AuthContext, permission: Permission): boolean {
  return ctx.permissions.includes(permission);
}

function safeParsePermissions(value: string): Permission[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? (parsed as Permission[]) : [];
  } catch {
    return [];
  }
}
