'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { hashPassword, prisma, verifyPassword } from '@pulso/database';
import { DEFAULT_ROLE_PERMISSIONS } from '@pulso/domain';
import { PLAN_SEAT_LIMIT, ROLE_KEY, registerOrganizationSchema, type RoleKey } from '@pulso/shared';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/constants';
import { getSessionIdentity } from '@/lib/auth/context';
import {
  createPersistedSession,
  hashOpaqueToken,
  normalizeEmail,
  revokeSessionToken,
  setActiveSessionOrganization,
} from '@/lib/auth/session';
import { isPublicRegistrationEnabled } from '@/lib/deployment-features';
import type { AuthFlowState, LoginState, RegisterState } from '@/server/action-types';
import {
  acceptOrganizationInvite,
  consumeAuthRateLimit,
  issueVerificationToken,
  requestPasswordReset,
  resetPasswordWithToken,
  createDesktopAuthorizationCode,
  changePassword,
  revokeUserSession,
  registerAndAcceptOrganizationInvite,
} from '@/server/auth-service';

const ROLE_NAMES: Record<RoleKey, string> = {
  SUPER_ADMIN: 'Super Admin',
  ORG_ADMIN: 'Administrador de organizacion',
  TEAM_ADMIN: 'Administrador de equipo',
  COORDINATOR: 'Coordinador',
  MEMBER: 'Miembro',
  VIEWER: 'Observador',
};

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const password = String(formData.get('password') ?? '');
  const returnTo = safeReturnTo(String(formData.get('returnTo') ?? ''));
  if (!email || !password) return { error: 'Completá email y contraseña.' };
  const requestHeaders = await headers();
  const clientAddress = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? requestHeaders.get('x-real-ip')
    ?? 'unknown';
  const [emailAllowed, addressAllowed] = await Promise.all([
    consumeAuthRateLimit('LOGIN_EMAIL', email, 10, 15 * 60_000, 15 * 60_000),
    consumeAuthRateLimit('LOGIN_ADDRESS', clientAddress, 50, 15 * 60_000, 15 * 60_000),
  ]);
  if (!emailAllowed || !addressAllowed) {
    return { error: 'Credenciales inválidas o demasiados intentos. Probá más tarde.' };
  }

  const user = await prisma.user.findUnique({ where: { normalizedEmail: email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: 'Credenciales inválidas.' };
  }
  if (user.status !== 'ACTIVE') return { error: 'Credenciales inválidas.' };
  if (!user.emailVerifiedAt) return { error: 'Verificá tu email antes de iniciar sesión.' };

  const memberships = await prisma.orgMembership.findMany({
    where: { userId: user.id, status: 'ACTIVE' },
    select: { organizationId: true },
    orderBy: [{ createdAt: 'asc' }, { organizationId: 'asc' }],
    take: 2,
  });
  if (memberships.length === 0) return { error: 'El usuario no pertenece a ninguna organización.' };

  const activeOrganizationId = memberships.length === 1 ? memberships[0]!.organizationId : null;
  await replaceSessionCookie(user.id, activeOrganizationId, user.securityVersion);
  redirect(activeOrganizationId
    ? (returnTo || '/')
    : `/select-organization${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`);
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSessionToken(token);
  store.delete(SESSION_COOKIE);
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
  const existingUser = await prisma.user.findUnique({ where: { normalizedEmail: input.adminEmail } });
  if (existingUser) return { error: 'Ese email ya esta registrado. Inicia sesion o usa otro email.' };

  const registration = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.organizationName,
        slug,
        planKey: input.planKey,
        seatLimit: PLAN_SEAT_LIMIT[input.planKey],
        subscription: { create: { planKey: input.planKey, provider: 'MOCK', status: 'ACTIVE' } },
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
        normalizedEmail: input.adminEmail,
        name: input.adminName,
        passwordHash: hashPassword(input.adminPassword),
      },
    });
    await tx.orgMembership.create({
      data: { organizationId: org.id, userId: user.id, roleId: roleByKey.get('ORG_ADMIN')!, isOwner: true },
    });
    const team = await tx.team.create({ data: { organizationId: org.id, name: 'General', focus: 'Primer equipo de trabajo' } });
    await tx.teamMembership.create({
      data: { organizationId: org.id, teamId: team.id, userId: user.id, roleId: roleByKey.get('TEAM_ADMIN')! },
    });
    return { userId: user.id, email: user.email };
  });

  await issueVerificationToken(registration.userId, registration.email);
  redirect('/login');
}

export async function selectOrganizationAction(formData: FormData): Promise<void> {
  const session = await getSessionIdentity();
  if (!session) redirect('/login');
  const organizationId = String(formData.get('organizationId') ?? '').trim();
  const returnTo = safeReturnTo(String(formData.get('returnTo') ?? ''));
  if (!organizationId) throw new Error('Seleccioná una organización.');

  const membership = await prisma.orgMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: session.userId } },
    select: { id: true },
  });
  if (!membership) throw new Error('Organización no disponible.');

  if (!await setActiveSessionOrganization(session, organizationId)) {
    throw new Error('Organización no disponible.');
  }
  redirect(returnTo || '/');
}

export async function forgotPasswordAction(_prev: AuthFlowState, formData: FormData): Promise<AuthFlowState> {
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  if (!email) return { status: 'error', error: 'Ingresá tu email.' };
  const requestHeaders = await headers();
  const clientAddress = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? requestHeaders.get('x-real-ip')
    ?? 'unknown';
  if (await consumeAuthRateLimit('PASSWORD_RESET', `${clientAddress}:${email}`, 5, 60 * 60_000, 60 * 60_000)) {
    await requestPasswordReset(email);
  }
  return {
    status: 'success',
    message: 'Si existe una cuenta verificada, preparamos las instrucciones de recuperación.',
  };
}

export async function resetPasswordAction(_prev: AuthFlowState, formData: FormData): Promise<AuthFlowState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirmation = String(formData.get('confirmation') ?? '');
  if (password !== confirmation) return { status: 'error', error: 'Las contraseñas no coinciden.' };
  if (password.length < 12 || password.length > 256) {
    return { status: 'error', error: 'La contraseña debe tener entre 12 y 256 caracteres.' };
  }
  const changed = await resetPasswordWithToken(token, password);
  return changed
    ? { status: 'success', message: 'Contraseña actualizada. Iniciá sesión nuevamente.' }
    : { status: 'error', error: 'El enlace no es válido o ya fue utilizado.' };
}

export async function acceptInviteAction(_prev: AuthFlowState, formData: FormData): Promise<AuthFlowState> {
  const session = await getSessionIdentity();
  if (!session) return { status: 'error', error: 'Iniciá sesión para aceptar la invitación.' };
  const token = String(formData.get('token') ?? '');
  const accepted = await acceptOrganizationInvite(token, session.userId);
  if (!accepted) return { status: 'error', error: 'La invitación no es válida para esta cuenta.' };
  return { status: 'success', message: 'Invitación aceptada. Ya podés seleccionar la nueva organización.' };
}

export async function inviteSignupAction(_prev: AuthFlowState, formData: FormData): Promise<AuthFlowState> {
  const token = String(formData.get('token') ?? '');
  const name = String(formData.get('name') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirmation = String(formData.get('confirmation') ?? '');
  if (password !== confirmation) return { status: 'error', error: 'Las contraseñas no coinciden.' };
  const requestHeaders = await headers();
  const clientAddress = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? requestHeaders.get('x-real-ip')
    ?? 'unknown';
  if (!await consumeAuthRateLimit('INVITE_SIGNUP', `${clientAddress}:${hashOpaqueToken(token)}`, 10, 60 * 60_000, 60 * 60_000)) {
    return { status: 'error', error: 'La invitación no es válida o ya fue utilizada.' };
  }
  const registration = await registerAndAcceptOrganizationInvite(token, name, password);
  if (!registration) return { status: 'error', error: 'La invitación no es válida o la cuenta ya existe.' };
  await replaceSessionCookie(registration.userId, registration.organizationId, registration.securityVersion);
  redirect('/');
}

export async function authorizeDesktopAction(formData: FormData): Promise<void> {
  const session = await getSessionIdentity();
  if (!session) redirect('/login');
  const codeChallenge = String(formData.get('codeChallenge') ?? '');
  const redirectUri = String(formData.get('redirectUri') ?? '');
  const state = String(formData.get('state') ?? '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new Error('Estado de autorización inválido.');
  const authorization = await createDesktopAuthorizationCode({
    userId: session.userId,
    activeOrganizationId: session.activeOrganizationId,
    codeChallenge,
    redirectUri,
  });
  const callback = new URL(authorization.redirectUri);
  callback.searchParams.set('code', authorization.code);
  callback.searchParams.set('state', state);
  redirect(callback.toString());
}

export async function changePasswordAction(_prev: AuthFlowState, formData: FormData): Promise<AuthFlowState> {
  const session = await getSessionIdentity();
  if (!session) return { status: 'error', error: 'La sesión expiró.' };
  const currentPassword = String(formData.get('currentPassword') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmation = String(formData.get('confirmation') ?? '');
  if (newPassword !== confirmation) return { status: 'error', error: 'Las contraseñas no coinciden.' };
  const changed = await changePassword(session.userId, currentPassword, newPassword);
  if (!changed) return { status: 'error', error: 'No se pudo cambiar la contraseña.' };
  (await cookies()).delete(SESSION_COOKIE);
  return { status: 'success', message: 'Contraseña actualizada. Todas las sesiones fueron revocadas.' };
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const session = await getSessionIdentity();
  if (!session) redirect('/login');
  const sessionId = String(formData.get('sessionId') ?? '');
  if (sessionId) await revokeUserSession(session.userId, sessionId);
  if (sessionId === session.id) {
    (await cookies()).delete(SESSION_COOKIE);
    redirect('/login');
  }
  redirect('/account/security');
}

async function replaceSessionCookie(userId: string, activeOrganizationId: string | null, securityVersion: number): Promise<void> {
  const store = await cookies();
  const previous = store.get(SESSION_COOKIE)?.value;
  if (previous) await revokeSessionToken(previous);
  const requestHeaders = await headers();
  const { token } = await createPersistedSession({
    userId,
    activeOrganizationId,
    securityVersion,
    deviceName: 'Web',
    userAgent: requestHeaders.get('user-agent'),
  });
  store.set(SESSION_COOKIE, token, {
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

function safeReturnTo(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '';
  return value.slice(0, 2048);
}

async function uniqueOrgSlug(base: string): Promise<string> {
  let slug = base;
  let i = 2;
  while (await prisma.organization.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${i++}`.slice(0, 48);
  }
  return slug;
}
