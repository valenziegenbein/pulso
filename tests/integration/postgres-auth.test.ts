import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decryptSecret, hashPassword, prisma, verifyPassword } from '@pulso/database';
import {
  acceptOrganizationInvite,
  consumeAuthRateLimit,
  createOrganizationInvite,
  createDesktopAuthorizationCode,
  exchangeDesktopAuthorizationCode,
  issueVerificationToken,
  MockAuthNotificationProvider,
  requestPasswordReset,
  registerAndAcceptOrganizationInvite,
  resetPasswordWithToken,
  verifyEmailToken,
} from '@/server/auth-service';
import {
  createPersistedSession,
  hashOpaqueToken,
  revokeSessionToken,
  verifySessionToken,
} from '@/lib/auth/session';

const ids = {
  orgA: 'auth-org-a',
  orgB: 'auth-org-b',
  roleAdminA: 'auth-role-admin-a',
  roleTeamAdminA: 'auth-role-team-admin-a',
  roleMemberA: 'auth-role-member-a',
  roleMemberB: 'auth-role-member-b',
  teamA: 'auth-team-a',
  teamB: 'auth-team-b',
  admin: 'auth-user-admin',
  teamAdmin: 'auth-user-team-admin',
  invitee: 'auth-user-invitee',
  unverified: 'auth-user-unverified',
  reset: 'auth-user-reset',
} as const;

beforeAll(async () => {
  process.env.WORKLOG_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  await prisma.organization.createMany({
    data: [
      { id: ids.orgA, name: 'Auth A', slug: 'auth-integration-a' },
      { id: ids.orgB, name: 'Auth B', slug: 'auth-integration-b' },
    ],
  });
  await prisma.role.createMany({
    data: [
      { id: ids.roleAdminA, organizationId: ids.orgA, key: 'ORG_ADMIN', name: 'Admin', permissions: '[]' },
      { id: ids.roleTeamAdminA, organizationId: ids.orgA, key: 'TEAM_ADMIN', name: 'Team Admin', permissions: '[]' },
      { id: ids.roleMemberA, organizationId: ids.orgA, key: 'MEMBER', name: 'Member A', permissions: '[]' },
      { id: ids.roleMemberB, organizationId: ids.orgB, key: 'MEMBER', name: 'Member B', permissions: '[]' },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: ids.admin, email: 'auth-admin@integration.invalid', normalizedEmail: 'auth-admin@integration.invalid', name: 'Admin', passwordHash: hashPassword('initial-password'), emailVerifiedAt: new Date() },
      { id: ids.teamAdmin, email: 'auth-team-admin@integration.invalid', normalizedEmail: 'auth-team-admin@integration.invalid', name: 'Team Admin', passwordHash: hashPassword('initial-password'), emailVerifiedAt: new Date() },
      { id: ids.invitee, email: 'auth-invitee@integration.invalid', normalizedEmail: 'auth-invitee@integration.invalid', name: 'Invitee', passwordHash: hashPassword('initial-password'), emailVerifiedAt: new Date() },
      { id: ids.unverified, email: 'auth-unverified@integration.invalid', normalizedEmail: 'auth-unverified@integration.invalid', name: 'Unverified', passwordHash: hashPassword('initial-password') },
      { id: ids.reset, email: 'auth-reset@integration.invalid', normalizedEmail: 'auth-reset@integration.invalid', name: 'Reset', passwordHash: hashPassword('initial-password'), emailVerifiedAt: new Date() },
    ],
  });
  await prisma.orgMembership.createMany({
    data: [
      { organizationId: ids.orgA, userId: ids.admin, roleId: ids.roleAdminA },
      { organizationId: ids.orgA, userId: ids.teamAdmin, roleId: ids.roleTeamAdminA },
    ],
  });
  await prisma.team.createMany({
    data: [
      { id: ids.teamA, organizationId: ids.orgA, name: 'Auth Team A' },
      { id: ids.teamB, organizationId: ids.orgB, name: 'Auth Team B' },
    ],
  });
  await prisma.teamMembership.create({
    data: {
      organizationId: ids.orgA,
      teamId: ids.teamA,
      userId: ids.teamAdmin,
      roleId: ids.roleTeamAdminA,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PostgreSQL real: sesiones persistidas', () => {
  it('stores only the hash and revokes the opaque session immediately', async () => {
    const { token, session } = await createPersistedSession({
      userId: ids.admin,
      activeOrganizationId: ids.orgA,
      securityVersion: 1,
      deviceName: 'Integration Web',
    });
    const stored = await prisma.authSession.findUnique({ where: { id: session.id } });
    expect(stored?.tokenHash).toBe(hashOpaqueToken(token));
    expect(stored?.tokenHash).not.toBe(token);
    await expect(verifySessionToken(token)).resolves.toMatchObject({ userId: ids.admin, activeOrganizationId: ids.orgA });
    await revokeSessionToken(token);
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it('invalidates sessions when the user security version changes', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.admin } });
    const { token } = await createPersistedSession({ userId: user.id, activeOrganizationId: ids.orgA, securityVersion: user.securityVersion });
    await prisma.user.update({ where: { id: user.id }, data: { securityVersion: { increment: 1 } } });
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });
});

describe('PostgreSQL real: rate limit de auth', () => {
  it('blocks attempts after the configured limit without storing the subject', async () => {
    const subject = '127.0.0.1:rate-limit@integration.invalid';
    await expect(consumeAuthRateLimit('LOGIN_TEST', subject, 3, 60_000, 60_000)).resolves.toBe(true);
    await expect(consumeAuthRateLimit('LOGIN_TEST', subject, 3, 60_000, 60_000)).resolves.toBe(true);
    await expect(consumeAuthRateLimit('LOGIN_TEST', subject, 3, 60_000, 60_000)).resolves.toBe(true);
    await expect(consumeAuthRateLimit('LOGIN_TEST', subject, 3, 60_000, 60_000)).resolves.toBe(false);
    const bucket = await prisma.authRateLimitBucket.findFirstOrThrow({ where: { action: 'LOGIN_TEST' } });
    expect(bucket.keyHash).toBe(hashOpaqueToken(subject));
    expect(bucket.keyHash).not.toContain('rate-limit@integration.invalid');
  });
});

describe('PostgreSQL real: tokens de auth de un solo uso', () => {
  it('verifies email once and never stores the raw token', async () => {
    const provider = new MockAuthNotificationProvider();
    await issueVerificationToken(ids.unverified, 'AUTH-Unverified@Integration.Invalid', provider);
    const delivery = provider.deliveries[0]!;
    const stored = await prisma.verificationToken.findFirstOrThrow({ where: { userId: ids.unverified } });
    expect(stored.tokenHash).toBe(hashOpaqueToken(delivery.token));
    expect(stored.tokenHash).not.toBe(delivery.token);
    await expect(verifyEmailToken(delivery.token)).resolves.toBe(true);
    await expect(verifyEmailToken(delivery.token)).resolves.toBe(false);
    await expect(prisma.user.findUnique({ where: { id: ids.unverified } })).resolves.toMatchObject({ status: 'ACTIVE' });
  });

  it('keeps password-reset responses indistinguishable and revokes existing sessions', async () => {
    const provider = new MockAuthNotificationProvider();
    await requestPasswordReset('missing@integration.invalid', provider);
    expect(provider.deliveries).toHaveLength(0);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ids.reset } });
    const { token: sessionToken } = await createPersistedSession({ userId: user.id, activeOrganizationId: null, securityVersion: user.securityVersion });
    await requestPasswordReset('AUTH-RESET@INTEGRATION.INVALID', provider);
    const resetToken = provider.deliveries[0]!.token;
    await expect(resetPasswordWithToken(resetToken, 'new-password-long-enough')).resolves.toBe(true);
    await expect(resetPasswordWithToken(resetToken, 'another-password-long-enough')).resolves.toBe(false);
    await expect(verifySessionToken(sessionToken)).resolves.toBeNull();
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: ids.reset } });
    expect(verifyPassword('new-password-long-enough', updated.passwordHash)).toBe(true);
    expect(updated.securityVersion).toBe(user.securityVersion + 1);
  });

  it('commits the auth token and encrypted outbox row atomically', async () => {
    const previousUrl = process.env.PULSO_APP_URL;
    process.env.PULSO_APP_URL = 'http://127.0.0.1:3000';
    try {
      await issueVerificationToken(ids.unverified, 'auth-unverified@integration.invalid');
      const row = await prisma.emailOutbox.findFirstOrThrow({
        where: { recipient: 'auth-unverified@integration.invalid', template: 'VERIFY_EMAIL' },
        orderBy: { createdAt: 'desc' },
      });
      const payload = JSON.parse(decryptSecret(row.payloadEncrypted)) as { actionUrl: string };
      const rawToken = new URL(payload.actionUrl).searchParams.get('token');
      expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(row.payloadEncrypted).not.toContain(rawToken!);
      await expect(prisma.verificationToken.findUnique({
        where: { tokenHash: hashOpaqueToken(rawToken!) },
      })).resolves.toMatchObject({ userId: ids.unverified, consumedAt: null });

      const tokenCount = await prisma.verificationToken.count({ where: { userId: ids.unverified } });
      process.env.PULSO_APP_URL = 'http://public.example.invalid';
      await expect(issueVerificationToken(ids.unverified, 'auth-unverified@integration.invalid'))
        .rejects.toThrow('PULSO_APP_URL');
      await expect(prisma.verificationToken.count({ where: { userId: ids.unverified } }))
        .resolves.toBe(tokenCount);
    } finally {
      if (previousUrl === undefined) delete process.env.PULSO_APP_URL;
      else process.env.PULSO_APP_URL = previousUrl;
    }
  });
});

describe('PostgreSQL real: invitaciones multi-organización', () => {
  it('does not create a membership until the matching global identity accepts', async () => {
    const provider = new MockAuthNotificationProvider();
    await createOrganizationInvite({
      organizationId: ids.orgA,
      invitedById: ids.admin,
      email: 'AUTH-INVITEE@INTEGRATION.INVALID',
      roleId: ids.roleMemberA,
      teamId: ids.teamA,
    }, provider);
    await expect(prisma.orgMembership.findUnique({
      where: { organizationId_userId: { organizationId: ids.orgA, userId: ids.invitee } },
    })).resolves.toBeNull();
    const inviteToken = provider.deliveries[0]!.token;
    await expect(acceptOrganizationInvite(inviteToken, ids.unverified)).resolves.toBe(false);
    await expect(acceptOrganizationInvite(inviteToken, ids.invitee)).resolves.toBe(true);
    await expect(acceptOrganizationInvite(inviteToken, ids.invitee)).resolves.toBe(false);
    await expect(prisma.orgMembership.findUnique({
      where: { organizationId_userId: { organizationId: ids.orgA, userId: ids.invitee } },
    })).resolves.toMatchObject({ roleId: ids.roleMemberA, status: 'ACTIVE' });
    await expect(prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId: ids.teamA, userId: ids.invitee } },
    })).resolves.toMatchObject({ organizationId: ids.orgA });
  });

  it('rejects a team or role from another organization', async () => {
    const provider = new MockAuthNotificationProvider();
    await expect(createOrganizationInvite({
      organizationId: ids.orgA,
      invitedById: ids.admin,
      email: 'other@integration.invalid',
      roleId: ids.roleMemberB,
      teamId: ids.teamA,
    }, provider)).rejects.toThrow('Rol o equipo no disponible.');
    await expect(createOrganizationInvite({
      organizationId: ids.orgA,
      invitedById: ids.admin,
      email: 'other@integration.invalid',
      roleId: ids.roleMemberA,
      teamId: ids.teamB,
    }, provider)).rejects.toThrow('Rol o equipo no disponible.');
  });

  it('allows TEAM_ADMIN only inside the assigned team', async () => {
    const provider = new MockAuthNotificationProvider();
    await expect(createOrganizationInvite({
      organizationId: ids.orgA,
      invitedById: ids.teamAdmin,
      email: 'team-admin-target@integration.invalid',
      roleId: ids.roleMemberA,
      teamId: ids.teamA,
    }, provider)).resolves.toMatchObject({ inviteId: expect.any(String) });
    await expect(createOrganizationInvite({
      organizationId: ids.orgA,
      invitedById: ids.teamAdmin,
      email: 'team-admin-forbidden@integration.invalid',
      roleId: ids.roleMemberA,
      teamId: ids.teamB,
    }, provider)).rejects.toThrow();
  });

  it('keeps only one pending invite per organization and email', async () => {
    const provider = new MockAuthNotificationProvider();
    await createOrganizationInvite({
      organizationId: ids.orgA,
      invitedById: ids.admin,
      email: 'single-pending@integration.invalid',
      roleId: ids.roleMemberA,
    }, provider);
    await createOrganizationInvite({
      organizationId: ids.orgA,
      invitedById: ids.admin,
      email: 'SINGLE-PENDING@INTEGRATION.INVALID',
      roleId: ids.roleMemberA,
    }, provider);
    const rows = await prisma.organizationInvite.findMany({
      where: { organizationId: ids.orgA, normalizedEmail: 'single-pending@integration.invalid' },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.filter((row) => row.status === 'PENDING')).toHaveLength(1);
    expect(rows.filter((row) => row.status === 'SUPERSEDED')).toHaveLength(1);
    expect(rows.find((row) => row.status === 'PENDING')?.pendingKey).not.toContain('single-pending');
  });

  it('creates a verified global identity only through a valid invite', async () => {
    const provider = new MockAuthNotificationProvider();
    await createOrganizationInvite({
      organizationId: ids.orgA,
      invitedById: ids.admin,
      email: 'auth-new-invitee@integration.invalid',
      roleId: ids.roleMemberA,
      teamId: ids.teamA,
    }, provider);
    const registration = await registerAndAcceptOrganizationInvite(
      provider.deliveries[0]!.token,
      'New Invitee',
      'invite-password-long-enough',
    );
    expect(registration).toMatchObject({ organizationId: ids.orgA, securityVersion: 1 });
    const user = await prisma.user.findUniqueOrThrow({ where: { normalizedEmail: 'auth-new-invitee@integration.invalid' } });
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    await expect(prisma.orgMembership.findUnique({
      where: { organizationId_userId: { organizationId: ids.orgA, userId: user.id } },
    })).resolves.toMatchObject({ status: 'ACTIVE', roleId: ids.roleMemberA });
    await expect(registerAndAcceptOrganizationInvite(
      provider.deliveries[0]!.token,
      'Replay',
      'invite-password-long-enough',
    )).resolves.toBeNull();
  });
});

describe('PostgreSQL real: Desktop authorization code + PKCE', () => {
  it('exchanges a loopback code once and rejects a wrong verifier', async () => {
    const verifier = 'desktop-verifier-abcdefghijklmnopqrstuvwxyz0123456789ABCDE';
    const redirectUri = 'http://127.0.0.1:43123/auth/callback';
    const authorization = await createDesktopAuthorizationCode({
      userId: ids.admin,
      activeOrganizationId: ids.orgA,
      codeChallenge: hashOpaqueToken(verifier),
      redirectUri,
    });
    await expect(exchangeDesktopAuthorizationCode({
      code: authorization.code,
      codeVerifier: 'wrong-verifier-abcdefghijklmnopqrstuvwxyz0123456789ABCDE',
      redirectUri,
    })).resolves.toBeNull();
    const sessionToken = await exchangeDesktopAuthorizationCode({
      code: authorization.code,
      codeVerifier: verifier,
      redirectUri,
      deviceName: 'Pulso Desktop Integration',
    });
    expect(sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(verifySessionToken(sessionToken!)).resolves.toMatchObject({
      userId: ids.admin,
      activeOrganizationId: ids.orgA,
    });
    await expect(exchangeDesktopAuthorizationCode({
      code: authorization.code,
      codeVerifier: verifier,
      redirectUri,
    })).resolves.toBeNull();
  });

  it('rejects non-loopback redirect URIs', async () => {
    await expect(createDesktopAuthorizationCode({
      userId: ids.admin,
      activeOrganizationId: ids.orgA,
      codeChallenge: 'a'.repeat(43),
      redirectUri: 'https://attacker.integration.invalid/auth/callback',
    })).rejects.toThrow('Solicitud PKCE inválida.');
  });
});
