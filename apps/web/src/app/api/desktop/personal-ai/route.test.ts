import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  access: vi.fn(),
  complete: vi.fn(),
}));

vi.mock('@/server/personal-account-ai', () => ({
  isPersonalAccountAiEnabled: mocks.enabled,
  getPersonalAccountAiAccess: mocks.access,
  createPersonalAccountAiProvider: () => ({ id: 'managed-test', complete: mocks.complete }),
}));

import { GET, POST } from './route';

afterEach(() => {
  vi.clearAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.access.mockResolvedValue({ authenticated: true, enabled: true, userId: 'user-allowed', model: 'gemini-test' });
  mocks.complete.mockResolvedValue({
    model: 'gemini-test',
    text: JSON.stringify({ type: 'PROGRESS', title: 'Avance seguro', content: 'Completé el flujo de prueba.' }),
  });
});

describe('/api/desktop/personal-ai', () => {
  it('permanece oculto si la whitelist no está habilitada', async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await GET()).status).toBe(404);
    expect((await POST(request({ operation: 'draft', note: 'avance' }))).status).toBe(404);
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it('distingue cuenta desconectada de cuenta fuera de la allowlist', async () => {
    mocks.access.mockResolvedValueOnce({ authenticated: false, enabled: false, reason: 'authentication_required' });
    const disconnected = await POST(request({ operation: 'draft', note: 'avance' }));
    expect(disconnected.status).toBe(401);

    mocks.access.mockResolvedValueOnce({ authenticated: true, enabled: false, reason: 'not_allowlisted', userId: 'user-denied' });
    const denied = await POST(request({ operation: 'draft', note: 'avance' }));
    expect(denied.status).toBe(403);
  });

  it('expone un status mínimo sin email, token ni configuración del proveedor', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ authenticated: true, enabled: true, model: 'gemini-test' });
    expect(JSON.stringify(data)).not.toMatch(/token|key|email|allowlist/i);
  });

  it('genera un borrador administrado e ignora host, modelo y key del cliente', async () => {
    const response = await POST(request({
      operation: 'draft',
      note: 'cerré el flujo',
      provider: 'attacker',
      baseUrl: 'http://169.254.169.254',
      model: 'attacker-model',
      apiKey: 'should-not-be-used',
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'DRAFT',
      suggestion: { type: 'PROGRESS', title: 'Avance seguro' },
    });
    expect(mocks.complete).toHaveBeenCalledOnce();
    const serializedRequest = JSON.stringify(mocks.complete.mock.calls[0]?.[0]);
    expect(serializedRequest).not.toContain('169.254.169.254');
    expect(serializedRequest).not.toContain('should-not-be-used');
    expect(serializedRequest).not.toContain('attacker-model');
  });

  it('rechaza payloads grandes antes de invocar el proveedor', async () => {
    const response = await POST(new Request('http://localhost/api/desktop/personal-ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '7000001' },
      body: '{}',
    }));
    expect(response.status).toBe(413);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/desktop/personal-ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
