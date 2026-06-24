'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { hashPassword, prisma, verifyPassword } from '@pulso/database';
import { DEFAULT_ROLE_PERMISSIONS } from '@pulso/domain';
import { PLAN_SEAT_LIMIT, ROLE_KEY, registerOrganizationSchema, type RoleKey } from '@pulso/shared';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/constants';
import { createSessionToken } from '@/lib/auth/session';
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

  const membership = await prisma.orgMembership.findFirst({ where: { userId: user.id } });
  if (!membership) return { error: 'El usuario no pertenece a ninguna organización.' };

  (await cookies()).set(SESSION_COOKIE, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}

export async function registerOrganizationAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
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

  const admin = await prisma.$transaction(async (tx) => {
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
      data: { teamId: team.id, userId: user.id, roleId: roleByKey.get('TEAM_ADMIN')! },
    });
    return user;
  });

  (await cookies()).set(SESSION_COOKIE, createSessionToken(admin.id), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
  redirect('/');
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
