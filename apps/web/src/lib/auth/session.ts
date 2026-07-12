import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@pulso/database';
import { SESSION_MAX_AGE } from './constants';

export interface VerifiedSession {
  id: string;
  userId: string;
  activeOrganizationId: string | null;
  expiresAt: number;
  version: 3;
}

interface CreateSessionInput {
  userId: string;
  activeOrganizationId: string | null;
  securityVersion: number;
  deviceName?: string | null;
  userAgent?: string | null;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function createPersistedSession(input: CreateSessionInput): Promise<{ token: string; session: VerifiedSession }> {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
  const row = await prisma.authSession.create({
    data: {
      tokenHash: hashOpaqueToken(token),
      userId: input.userId,
      activeOrganizationId: input.activeOrganizationId,
      securityVersion: input.securityVersion,
      deviceName: sanitizeDeviceName(input.deviceName),
      userAgentHash: input.userAgent ? hashOpaqueToken(input.userAgent) : null,
      expiresAt,
    },
    select: { id: true, userId: true, activeOrganizationId: true, expiresAt: true },
  });
  return {
    token,
    session: {
      id: row.id,
      userId: row.userId,
      activeOrganizationId: row.activeOrganizationId,
      expiresAt: row.expiresAt.getTime(),
      version: 3,
    },
  };
}

export async function verifySessionToken(token: string): Promise<VerifiedSession | null> {
  if (!isOpaqueToken(token)) return null;
  const row = await prisma.authSession.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: { user: { select: { status: true, securityVersion: true } } },
  });
  if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return null;
  if (row.user.status !== 'ACTIVE' || row.securityVersion !== row.user.securityVersion) return null;
  return {
    id: row.id,
    userId: row.userId,
    activeOrganizationId: row.activeOrganizationId,
    expiresAt: row.expiresAt.getTime(),
    version: 3,
  };
}

export async function revokeSessionToken(token: string): Promise<void> {
  if (!isOpaqueToken(token)) return;
  await prisma.authSession.updateMany({
    where: { tokenHash: hashOpaqueToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function setActiveSessionOrganization(session: VerifiedSession, organizationId: string): Promise<boolean> {
  const membership = await prisma.orgMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: session.userId } },
    select: { status: true },
  });
  if (membership?.status !== 'ACTIVE') return false;
  const updated = await prisma.authSession.updateMany({
    where: { id: session.id, userId: session.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { activeOrganizationId: organizationId, lastSeenAt: new Date() },
  });
  return updated.count === 1;
}

function isOpaqueToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

function sanitizeDeviceName(value?: string | null): string | null {
  const normalized = value?.replace(/[\r\n\t]/g, ' ').trim().slice(0, 120);
  return normalized || null;
}
