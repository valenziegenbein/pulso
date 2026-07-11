import { describe, expect, it } from 'vitest';
import { assertSeedAllowed } from './seed-safety';

describe('seed safety', () => {
  it('aborta explícitamente en producción', () => {
    expect(() => assertSeedAllowed('production')).toThrow('Seed bloqueado');
  });

  it('permite fixtures locales fuera de producción', () => {
    expect(() => assertSeedAllowed('test')).not.toThrow();
  });
});
