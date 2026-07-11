import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, verifySessionToken } from './session';

describe('session tenant selection', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-session-secret-with-enough-entropy';
  });

  it('firma activeOrganizationId explícito', () => {
    const session = verifySessionToken(createSessionToken('user-a', 'org-a'));
    expect(session).toMatchObject({ userId: 'user-a', activeOrganizationId: 'org-a', version: 2 });
  });

  it('permite sesión pendiente sin elegir automáticamente un tenant', () => {
    const session = verifySessionToken(createSessionToken('user-a', null));
    expect(session?.activeOrganizationId).toBeNull();
  });

  it('acepta temporalmente tokens legacy pero sin organización activa', () => {
    const payload = `user-a.${Date.now() + 60_000}`;
    const encoded = Buffer.from(payload).toString('base64url');
    const signature = createHmac('sha256', process.env.AUTH_SECRET!).update(payload).digest('base64url');
    expect(verifySessionToken(`${encoded}.${signature}`)).toMatchObject({
      userId: 'user-a',
      activeOrganizationId: null,
      version: 1,
    });
  });

  it('rechaza firma manipulada', () => {
    const token = createSessionToken('user-a', 'org-a');
    expect(verifySessionToken(`${token.slice(0, -1)}x`)).toBeNull();
  });
});
