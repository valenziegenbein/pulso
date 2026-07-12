import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  authSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
  orgMembership: { findUnique: vi.fn() },
}));

vi.mock('@pulso/database', () => ({ prisma }));

import {
  createPersistedSession,
  hashOpaqueToken,
  setActiveSessionOrganization,
  verifySessionToken,
} from './session';

const token = 'a'.repeat(43);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('persisted sessions', () => {
  it('stores only a token hash and keeps activeOrganizationId explicit', async () => {
    prisma.authSession.create.mockResolvedValue({
      id: 'session-a',
      userId: 'user-a',
      activeOrganizationId: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const created = await createPersistedSession({
      userId: 'user-a',
      activeOrganizationId: null,
      securityVersion: 1,
      deviceName: 'Web\nInjected',
    });
    const data = prisma.authSession.create.mock.calls[0]?.[0].data;
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(data.tokenHash).toBe(hashOpaqueToken(created.token));
    expect(data.tokenHash).not.toBe(created.token);
    expect(data.deviceName).toBe('Web Injected');
    expect(created.session.activeOrganizationId).toBeNull();
  });

  it('accepts only active, unexpired and non-revoked rows at the current security version', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      id: 'session-a',
      userId: 'user-a',
      activeOrganizationId: 'org-a',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      securityVersion: 2,
      user: { status: 'ACTIVE', securityVersion: 2 },
    });
    await expect(verifySessionToken(token)).resolves.toMatchObject({
      id: 'session-a',
      userId: 'user-a',
      activeOrganizationId: 'org-a',
      version: 3,
    });

    prisma.authSession.findUnique.mockResolvedValueOnce({
      id: 'session-a', userId: 'user-a', activeOrganizationId: null,
      expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date(), securityVersion: 2,
      user: { status: 'ACTIVE', securityVersion: 2 },
    });
    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it('rejects malformed tokens without querying the database', async () => {
    await expect(verifySessionToken('payload.signature')).resolves.toBeNull();
    expect(prisma.authSession.findUnique).not.toHaveBeenCalled();
  });

  it('updates active organization only for an active membership', async () => {
    prisma.orgMembership.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    prisma.authSession.updateMany.mockResolvedValue({ count: 1 });
    const session = { id: 'session-a', userId: 'user-a', activeOrganizationId: null, expiresAt: Date.now() + 60_000, version: 3 as const };
    await expect(setActiveSessionOrganization(session, 'org-a')).resolves.toBe(true);
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ activeOrganizationId: 'org-a' }),
    }));
  });
});
