import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  logServer: vi.fn(),
}));

vi.mock('@pulso/database', () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}));

vi.mock('@/server/logging', () => ({
  getRequestId: () => 'request-test',
  logServer: mocks.logServer,
}));

import { GET } from './route';

const previousRuntime = process.env.PULSO_RUNTIME;

afterEach(() => {
  vi.clearAllMocks();
  if (previousRuntime === undefined) delete process.env.PULSO_RUNTIME;
  else process.env.PULSO_RUNTIME = previousRuntime;
});

describe('/api/readiness', () => {
  it('declara listo el runtime Personal local sin intentar PostgreSQL', async () => {
    process.env.PULSO_RUNTIME = 'desktop-local';

    const response = await GET(new Request('http://localhost/api/readiness'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ready', runtime: 'desktop-local' });
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it('mantiene el chequeo PostgreSQL obligatorio fuera de Desktop local', async () => {
    delete process.env.PULSO_RUNTIME;
    mocks.queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

    const response = await GET(new Request('http://localhost/api/readiness'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ready' });
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
  });
});
