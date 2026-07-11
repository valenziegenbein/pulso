import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS } from '@pulso/domain';
import { createSessionToken } from './session';

const state = vi.hoisted(() => ({ token: '' }));
const prisma = vi.hoisted(() => ({ orgMembership: { findUnique: vi.fn() } }));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => state.token ? { value: state.token } : undefined }),
}));
vi.mock('@pulso/database', () => ({ prisma }));

import { getAuthContext } from './context';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SECRET = 'test-session-secret-with-enough-entropy';
});

describe('active organization context', () => {
  it('consulta la membresía compuesta de la organización activa, nunca findFirst', async () => {
    state.token = createSessionToken('user-a', 'org-b');
    prisma.orgMembership.findUnique.mockResolvedValue({
      organizationId: 'org-b',
      user: { id: 'user-a', name: 'User A', email: 'a@test.invalid', isSuperAdmin: false },
      organization: { name: 'Org B' },
      role: { key: 'MEMBER', permissions: JSON.stringify(DEFAULT_ROLE_PERMISSIONS.MEMBER) },
    });

    await expect(getAuthContext()).resolves.toMatchObject({ organizationId: 'org-b', user: { id: 'user-a' } });
    expect(prisma.orgMembership.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId_userId: { organizationId: 'org-b', userId: 'user-a' } },
    }));
  });

  it('no crea contexto si falta selección explícita', async () => {
    state.token = createSessionToken('user-a', null);
    await expect(getAuthContext()).resolves.toBeNull();
    expect(prisma.orgMembership.findUnique).not.toHaveBeenCalled();
  });
});
