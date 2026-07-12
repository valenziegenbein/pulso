import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
      '@pulso/database': fileURLToPath(new URL('./packages/database/src/index.ts', import.meta.url)),
      '@pulso/domain': fileURLToPath(new URL('./packages/domain/src/index.ts', import.meta.url)),
      '@pulso/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: [
      'tests/integration/postgres-security.test.ts',
      'tests/integration/postgres-auth.test.ts',
      'tests/integration/postgres-entitlements.test.ts',
    ],
    setupFiles: ['tests/integration/test-database-guard.ts'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
  },
});
