import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPersonalApiEnabled, isPublicRegistrationEnabled } from './deployment-features';

afterEach(() => vi.unstubAllEnvs());

describe('production feature flags', () => {
  it('cierra registro y APIs Personal por defecto en producción', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PULSO_PUBLIC_REGISTRATION_ENABLED', '');
    vi.stubEnv('PULSO_PERSONAL_API_ENABLED', '');
    expect(isPublicRegistrationEnabled()).toBe(false);
    expect(isPersonalApiEnabled()).toBe(false);
  });

  it('sólo abre una superficie con true explícito', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PULSO_PERSONAL_API_ENABLED', 'true');
    expect(isPersonalApiEnabled()).toBe(true);
    expect(isPublicRegistrationEnabled()).toBe(false);
  });
});
