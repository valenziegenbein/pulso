import { Prisma, prisma, hashPassword, verifyPassword } from '@pulso/database';
import { createOpaqueToken, hashOpaqueToken, normalizeEmail } from '@/lib/auth/session';
import { SESSION_MAX_AGE } from '@/lib/auth/constants';
import { assertSeatAvailable } from '@/server/entitlements';

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DESKTOP_CODE_TTL_MS = 5 * 60 * 1000;

export type AuthNotification = {
  kind: 'VERIFY_EMAIL' | 'RESET_PASSWORD' | 'ORGANIZATION_INVITE';
  recipient: string;
  token: string;
  organizationName?: string;
};

export interface AuthNotificationProvider {
  send(notification: AuthNotification): Promise<void>;
}

export class MockAuthNotificationProvider implements AuthNotificationProvider {
  readonly deliveries: AuthNotification[] = [];

  async send(notification: AuthNotification): Promise<void> {
    this.deliveries.push(notification);
  }
}

const runtimeAuthNotifications: AuthNotificationProvider = {
  async send(): Promise<void> {
    // P2 usa un sink mock: no loguea ni retiene tokens. P5 añadirá outbox real.
  },
};

export async function consumeAuthRateLimit(
  action: string,
  subject: string,
  limit: number,
  windowMs: number,
  blockMs: number,
): Promise<boolean> {
  const keyHash = hashOpaqueToken(subject);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const now = new Date();
        const row = await tx.authRateLimitBucket.findUnique({
          where: { action_keyHash: { action, keyHash } },
        });
        if (row?.blockedUntil && row.blockedUntil.getTime() > now.getTime()) return false;
        const windowExpired = !row || row.windowStartedAt.getTime() <= now.getTime() - windowMs;
        const nextCount = windowExpired ? 1 : row.attemptCount + 1;
        const blockedUntil = nextCount > limit ? new Date(now.getTime() + blockMs) : null;
        await tx.authRateLimitBucket.upsert({
          where: { action_keyHash: { action, keyHash } },
          update: {
            windowStartedAt: windowExpired ? now : row!.windowStartedAt,
            attemptCount: nextCount,
            blockedUntil,
          },
          create: {
            action,
            keyHash,
            windowStartedAt: now,
            attemptCount: nextCount,
            blockedUntil,
          },
        });
        return nextCount <= limit;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) throw error;
    }
  }
  return false;
}

export async function issueVerificationToken(
  userId: string,
  recipient: string,
  provider: AuthNotificationProvider = runtimeAuthNotifications,
): Promise<void> {
  const token = createOpaqueToken();
  await prisma.$transaction(async (tx) => {
    await tx.verificationToken.deleteMany({ where: { userId, consumedAt: null } });
    await tx.verificationToken.create({
      data: {
        userId,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    });
  });
  await provider.send({ kind: 'VERIFY_EMAIL', recipient: normalizeEmail(recipient), token });
}

export async function verifyEmailToken(token: string): Promise<boolean> {
  if (!token) return false;
  return prisma.$transaction(async (tx) => {
    const row = await tx.verificationToken.findUnique({ where: { tokenHash: hashOpaqueToken(token) } });
    if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now()) return false;
    const consumed = await tx.verificationToken.updateMany({
      where: { id: row.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) return false;
    await tx.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: new Date(), status: 'ACTIVE' },
    });
    return true;
  });
}

export async function requestPasswordReset(
  email: string,
  provider: AuthNotificationProvider = runtimeAuthNotifications,
): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { normalizedEmail } });
  if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) return;
  const token = createOpaqueToken();
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id, consumedAt: null } });
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
  });
  await provider.send({ kind: 'RESET_PASSWORD', recipient: normalizedEmail, token });
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
  if (!token || newPassword.length < 12 || newPassword.length > 256) return false;
  return prisma.$transaction(async (tx) => {
    const row = await tx.passwordResetToken.findUnique({ where: { tokenHash: hashOpaqueToken(token) } });
    if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now()) return false;
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) return false;
    const now = new Date();
    await tx.user.update({
      where: { id: row.userId },
      data: {
        passwordHash: hashPassword(newPassword),
        passwordChangedAt: now,
        securityVersion: { increment: 1 },
      },
    });
    await tx.authSession.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return true;
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  if (newPassword.length < 12 || newPassword.length > 256 || currentPassword === newPassword) return false;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== 'ACTIVE') return false;
  if (!verifyPassword(currentPassword, user.passwordHash)) return false;
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash: hashPassword(newPassword),
        passwordChangedAt: now,
        securityVersion: { increment: 1 },
      },
    });
    await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
  });
  return true;
}

export async function revokeUserSession(userId: string, sessionId: string): Promise<boolean> {
  const result = await prisma.authSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count === 1;
}

export async function listActiveSessions(userId: string) {
  return prisma.authSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true, deviceName: true, createdAt: true, lastSeenAt: true, expiresAt: true },
  });
}

interface CreateInviteInput {
  organizationId: string;
  invitedById: string;
  email: string;
  roleId: string;
  teamId?: string | null;
}

export async function createOrganizationInvite(
  input: CreateInviteInput,
  provider: AuthNotificationProvider = runtimeAuthNotifications,
): Promise<{ inviteId: string }> {
  const normalizedEmail = normalizeEmail(input.email);
  const pendingKey = hashOpaqueToken(`${input.organizationId}:${normalizedEmail}`);
  const token = createOpaqueToken();
  const invite = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const [organization, inviter, role, team] = await Promise.all([
      tx.organization.findUnique({ where: { id: input.organizationId }, select: { name: true } }),
      tx.orgMembership.findUnique({
        where: { organizationId_userId: { organizationId: input.organizationId, userId: input.invitedById } },
        include: { role: { select: { key: true } } },
      }),
      tx.role.findFirst({ where: { id: input.roleId, organizationId: input.organizationId }, select: { id: true, key: true } }),
      input.teamId
        ? tx.team.findFirst({ where: { id: input.teamId, organizationId: input.organizationId }, select: { id: true } })
        : Promise.resolve(null),
    ]);
    if (!organization || inviter?.status !== 'ACTIVE') {
      throw new Error('No autorizado para invitar miembros.');
    }
    if (!role || (input.teamId && !team)) throw new Error('Rol o equipo no disponible.');
    const organizationWide = ['ORG_ADMIN', 'SUPER_ADMIN'].includes(inviter.role.key);
    const teamAssignment = !organizationWide && inviter.role.key === 'TEAM_ADMIN' && team
      ? await tx.teamMembership.findFirst({
        where: {
          organizationId: input.organizationId,
          teamId: team.id,
          userId: input.invitedById,
          role: { key: 'TEAM_ADMIN' },
        },
        select: { id: true },
      })
      : null;
    const teamScoped = Boolean(teamAssignment) && !['SUPER_ADMIN', 'ORG_ADMIN'].includes(role.key);
    if (!organizationWide && !teamScoped) throw new Error('No autorizado para invitar miembros.');
    await tx.organizationInvite.updateMany({
      where: { organizationId: input.organizationId, normalizedEmail, status: 'PENDING' },
      data: { status: 'SUPERSEDED', pendingKey: null },
    });
    return tx.organizationInvite.create({
      data: {
        organizationId: input.organizationId,
        normalizedEmail,
        roleId: input.roleId,
        teamId: input.teamId ?? null,
        tokenHash: hashOpaqueToken(token),
        pendingKey,
        invitedById: input.invitedById,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      select: { id: true, organization: { select: { name: true } } },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  await provider.send({
    kind: 'ORGANIZATION_INVITE',
    recipient: normalizedEmail,
    token,
    organizationName: invite.organization.name,
  });
  return { inviteId: invite.id };
}

export async function acceptOrganizationInvite(token: string, userId: string): Promise<boolean> {
  if (!token) return false;
  return prisma.$transaction(async (tx) => {
    const invite = await tx.organizationInvite.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
      include: { team: { select: { organizationId: true } } },
    });
    if (!invite || invite.status !== 'PENDING' || invite.expiresAt.getTime() <= Date.now()) return false;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { normalizedEmail: true, status: true } });
    if (!user || user.status !== 'ACTIVE' || user.normalizedEmail !== invite.normalizedEmail) return false;
    if (invite.team && invite.team.organizationId !== invite.organizationId) return false;
    await assertSeatAvailable(tx, invite.organizationId, userId);
    const accepted = await tx.organizationInvite.updateMany({
      where: { id: invite.id, status: 'PENDING', acceptedAt: null, expiresAt: { gt: new Date() } },
      data: { status: 'ACCEPTED', pendingKey: null, acceptedById: userId, acceptedAt: new Date() },
    });
    if (accepted.count !== 1) return false;
    await tx.orgMembership.upsert({
      where: { organizationId_userId: { organizationId: invite.organizationId, userId } },
      update: { roleId: invite.roleId, status: 'ACTIVE' },
      create: { organizationId: invite.organizationId, userId, roleId: invite.roleId, status: 'ACTIVE' },
    });
    if (invite.teamId) {
      await tx.teamMembership.upsert({
        where: { teamId_userId: { teamId: invite.teamId, userId } },
        update: { roleId: invite.roleId },
        create: {
          organizationId: invite.organizationId,
          teamId: invite.teamId,
          userId,
          roleId: invite.roleId,
        },
      });
    }
    return true;
  });
}

export async function registerAndAcceptOrganizationInvite(
  token: string,
  name: string,
  password: string,
): Promise<{ userId: string; organizationId: string; securityVersion: number } | null> {
  const cleanName = name.trim();
  if (!token || cleanName.length < 2 || cleanName.length > 120 || password.length < 12 || password.length > 256) return null;
  return prisma.$transaction(async (tx) => {
    const invite = await tx.organizationInvite.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
      include: { team: { select: { organizationId: true } } },
    });
    if (!invite || invite.status !== 'PENDING' || invite.expiresAt.getTime() <= Date.now()) return null;
    if (invite.team && invite.team.organizationId !== invite.organizationId) return null;
    if (await tx.user.findUnique({ where: { normalizedEmail: invite.normalizedEmail }, select: { id: true } })) return null;
    await assertSeatAvailable(tx, invite.organizationId, `invite:${invite.id}`);
    const claimed = await tx.organizationInvite.updateMany({
      where: { id: invite.id, status: 'PENDING', acceptedAt: null, expiresAt: { gt: new Date() } },
      data: { status: 'ACCEPTING', pendingKey: null },
    });
    if (claimed.count !== 1) return null;
    const user = await tx.user.create({
      data: {
        email: invite.normalizedEmail,
        normalizedEmail: invite.normalizedEmail,
        name: cleanName,
        passwordHash: hashPassword(password),
        emailVerifiedAt: new Date(),
      },
    });
    const accepted = await tx.organizationInvite.updateMany({
      where: { id: invite.id, status: 'ACCEPTING', acceptedAt: null },
      data: { status: 'ACCEPTED', acceptedById: user.id, acceptedAt: new Date() },
    });
    if (accepted.count !== 1) throw new Error('No se pudo completar la invitación.');
    await tx.orgMembership.create({
      data: { organizationId: invite.organizationId, userId: user.id, roleId: invite.roleId, status: 'ACTIVE' },
    });
    if (invite.teamId) {
      await tx.teamMembership.create({
        data: {
          organizationId: invite.organizationId,
          teamId: invite.teamId,
          userId: user.id,
          roleId: invite.roleId,
        },
      });
    }
    return { userId: user.id, organizationId: invite.organizationId, securityVersion: user.securityVersion };
  });
}

export async function createDesktopAuthorizationCode(input: {
  userId: string;
  activeOrganizationId: string | null;
  codeChallenge: string;
  redirectUri: string;
}): Promise<{ code: string; redirectUri: string }> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge) || !isAllowedDesktopRedirect(input.redirectUri)) {
    throw new Error('Solicitud PKCE inválida.');
  }
  if (input.activeOrganizationId) {
    const membership = await prisma.orgMembership.findUnique({
      where: { organizationId_userId: { organizationId: input.activeOrganizationId, userId: input.userId } },
      select: { status: true },
    });
    if (membership?.status !== 'ACTIVE') throw new Error('Organización activa inválida.');
  }
  const code = createOpaqueToken();
  await prisma.desktopAuthorizationCode.create({
    data: {
      codeHash: hashOpaqueToken(code),
      userId: input.userId,
      activeOrganizationId: input.activeOrganizationId,
      codeChallenge: input.codeChallenge,
      redirectUri: input.redirectUri,
      expiresAt: new Date(Date.now() + DESKTOP_CODE_TTL_MS),
    },
  });
  return { code, redirectUri: input.redirectUri };
}

export async function exchangeDesktopAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  deviceName?: string | null;
}): Promise<string | null> {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier) || !isAllowedDesktopRedirect(input.redirectUri)) return null;
  const codeHash = hashOpaqueToken(input.code);
  const challenge = hashOpaqueToken(input.codeVerifier);
  const sessionToken = createOpaqueToken();
  return prisma.$transaction(async (tx) => {
    const row = await tx.desktopAuthorizationCode.findUnique({
      where: { codeHash },
      include: { user: { select: { status: true, securityVersion: true } } },
    });
    if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now()) return null;
    if (row.user.status !== 'ACTIVE' || row.redirectUri !== input.redirectUri || row.codeChallenge !== challenge) return null;
    const consumed = await tx.desktopAuthorizationCode.updateMany({
      where: { id: row.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) return null;
    await tx.authSession.create({
      data: {
        tokenHash: hashOpaqueToken(sessionToken),
        userId: row.userId,
        activeOrganizationId: row.activeOrganizationId,
        securityVersion: row.user.securityVersion,
        deviceName: input.deviceName?.replace(/[\r\n\t]/g, ' ').trim().slice(0, 120) || 'Pulso Desktop',
        expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000),
      },
    });
    return sessionToken;
  });
}

function isAllowedDesktopRedirect(value: string): boolean {
  try {
    const url = new URL(value);
    const port = Number(url.port);
    return url.protocol === 'http:'
      && ['127.0.0.1', '[::1]'].includes(url.hostname)
      && Number.isInteger(port)
      && port >= 1024
      && port <= 65535
      && url.pathname === '/auth/callback'
      && !url.username
      && !url.password
      && !url.hash;
  } catch {
    return false;
  }
}

async function withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError
        && ['P2002', 'P2034'].includes(error.code);
      if (!retryable || attempt === 2) throw error;
    }
  }
  throw new Error('No se pudo serializar la operación.');
}
