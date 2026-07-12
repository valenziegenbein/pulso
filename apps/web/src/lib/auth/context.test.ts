import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS } from '@pulso/domain';

const state = vi.hoisted(() => ({ token: 'a'.repeat(43) }));
const prisma = vi.hoisted(() => ({
  authSession: { findUnique: vi.fn() },
  orgMembership: { findUnique: vi.fn() },
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => state.token ? { value: state.token } : undefined }),
}));
vi.mock('@pulso/database', () => ({ prisma }));

import { getAuthContext } from './context';

beforeEach(() => {
  vi.clearAllMocks();
  state.token = 'a'.repeat(43);
});

describe('active organization context', () => {
  it('uses the organization persisted in the revocable session', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      id: 'session-a', userId: 'user-a', activeOrganizationId: 'org-b',
      expiresAt: new Date(Date.now() + 60_000), revokedAt: null, securityVersion: 1,
      user: { status: 'ACTIVE', securityVersion: 1 },
    });
    prisma.orgMembership.findUnique.mockResolvedValue({
      organizationId: 'org-b',
      status: 'ACTIVE',
      user: { id: 'user-a', name: 'User A', email: 'a@test.invalid', isSuperAdmin: false },
      organization: { name: 'Org B' },
      role: { key: 'MEMBER', permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS.MEMBER) },
    });

    await expect(getAuthContext()).resolves.toMatchObject({ organizationId: 'org-b', user: { id: 'user-a' } });
    expect(prisma.orgMembership.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_userId: { organizationId: 'org-b', userId: 'user-a' } },
    }));
  });

  it('does not create context without explicit tenant selection', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      id: 'session-a', userId: 'user-a', activeOrganizationId: null,
      expiresAt: new Date(Date.now() + 60_000), revokedAt: null, securityVersion: 1,
      user: { status: 'ACTIVE', securityVersion: 1 },
    });
    await expect(getAuthContext()).resolves.toBeNull();
    expect(prisma.orgMembership.findUnique).not.toHaveBeenCalled();
  });
});
