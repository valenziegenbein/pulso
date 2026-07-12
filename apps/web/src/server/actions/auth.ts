'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { hashPassword, prisma, verifyPassword } from '@pulso/database';
import { DEFAULT_ROLE_PERMISSIONS } from '@pulso/domain';
import { PLAN_SEAT_LIMIT, ROLE_KEY, registerOrganizationSchema, type RoleKey } from '@pulso/shared';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/constants';
import { getSessionIdentity } from '@/lib/auth/context';
import { createSessionToken } from '@/lib/auth/session';
import { isPublicRegistrationEnabled } from '@/lib/deployment-features';
import type { LoginState, RegisterState } from '@/server/action-types';

const ROLE_NAMES: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super Admin',
  ORG_ADMIN: 'Administrador de organizacion',
  TEAM_ADMIN: 'Administrador de equipo',
  COORDINATOR: 'Coordinador',
  MEMBER: 'Miembro',
  VIEWER: 'Observador',
};

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Completá email y contraseña.' };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: 'Credenciales inválidas.' };
  }

  const memberships = await prisma.orgMembership.findMany({
    where: { userId: user.id },
    select: { organizationId: true },
    orderBy: [{ createdAt: 'asc' }, { organizationId: 'asc' }],
    take: 2,
  });
  if (memberships.length === 0) return { error: 'El usuario no pertenece a ninguna organización.' };

  const activeOrganizationId = memberships.length === 1 ? memberships[0]!.organizationId : null;
  await setSessionCookie(user.id, activeOrganizationId);
  redirect(activeOrganizationId ? '/' : '/select-organization');
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}

export async function registerOrganizationAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  if (!isPublicRegistrationEnabled()) return { error: 'El registro público está temporalmente cerrado.' };
  const parsed = registerOrganizationSchema.safeParse({
    organizationName: String(formData.get('organizationName') ?? '').trim(),
    adminName: String(formData.get('adminName') ?? '').trim(),
    adminEmail: String(formData.get('adminEmail') ?? '').trim().toLowerCase(),
    adminPassword: String(formData.get('adminPassword') ?? ''),
    planKey: String(formData.get('planKey') ?? 'FREE'),
  });
  if (!parsed.success) return { error: 'Revisa los datos del registro.' };

  const input = parsed.data;
  const slug = await uniqueOrgSlug(slugify(input.organizationName));
  const existingUser = await prisma.user.findUnique({ where: { email: input.adminEmail } });
  if (existingUser) return { error: 'Ese email ya esta registrado. Inicia sesion o usa otro email.' };

  const registration = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.organizationName,
        slug,
        planKey: input.planKey,
        seatLimit: PLAN_SEAT_LIMIT[input.planKey],
      },
    });

    const roleByKey = new Map<RoleKey, string>();
    for (const key of ROLE_KEY) {
      const role = await tx.role.create({
        data: {
          organizationId: org.id,
          key,
          name: ROLE_NAMES[key],
          permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS[key]),
          isSystem: true,
        },
      });
      roleByKey.set(key, role.id);
    }

    const user = await tx.user.create({
      data: {
        email: input.adminEmail,
        name: input.adminName,
        passwordHash: hashPassword(input.adminPassword),
      },
    });
    await tx.orgMembership.create({
      data: { organizationId: org.id, userId: user.id, roleId: roleByKey.get('ORG_ADMIN')! },
    });
    const team = await tx.team.create({ data: { organizationId: org.id, name: 'General', focus: 'Primer equipo de trabajo' } });
    await tx.teamMembership.create({
      data: { organizationId: org.id, teamId: team.id, userId: user.id, roleId: roleByKey.get('TEAM_ADMIN')! },
    });
    return { userId: user.id, organizationId: org.id };
  });

  await setSessionCookie(registration.userId, registration.organizationId);
  redirect('/');
}

export async function selectOrganizationAction(formData: FormData): Promise<void> {
  const session = await getSessionIdentity();
  if (!session) redirect('/login');
  const organizationId = String(formData.get('organizationId') ?? '').trim();
  if (!organizationId) throw new Error('Seleccioná una organización.');

  const membership = await prisma.orgMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: session.userId } },
    select: { id: true },
  });
  if (!membership) throw new Error('Organización no disponible.');

  await setSessionCookie(session.userId, organizationId);
  redirect('/');
}

async function setSessionCookie(userId: string, activeOrganizationId: string | null): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, createSessionToken(userId, activeOrganizationId), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'organizacion';
}

async function uniqueOrgSlug(base: string): Promise<string> {
  let slug = base;
  let i = 2;
  while (await prisma.organization.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${i++}`.slice(0, 48);
  }
  return slug;
}
