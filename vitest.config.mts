import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };
const testDb = process.env.TEST_DATABASE_URL ?? 'postgres://lms:lms-dev-only@localhost:54329/lms_test';

export default defineConfig({
  test: {
    // Unit + component run: pure logic and UI. The integration run measures server/database code
    // (npm run test:int:coverage). Server components that read the database are covered by e2e.
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/server/policy.ts', 'src/components/**', 'src/app/**/*Form.tsx'],
      exclude: ['src/components/shell/AppShell.tsx'],
      thresholds: { lines: 90, branches: 85, functions: 90 },
    },
    projects: [
      { resolve: { alias }, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
      {
        plugins: [react()],
        resolve: { alias },
        test: { name: 'component', include: ['tests/component/**/*.test.tsx'], environment: 'jsdom' },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 30_000,
          env: {
            DATABASE_URL: testDb,
            BETTER_AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopq',
            BETTER_AUTH_URL: 'http://lms.localhost:3000',
          },
        },
      },
    ],
  },
});
