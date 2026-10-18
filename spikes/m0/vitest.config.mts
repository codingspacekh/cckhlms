import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };
export default defineConfig({
  test: {
    projects: [
      { resolve: { alias }, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
      {
        resolve: { alias },
        test: {
          name: 'integration', include: ['tests/integration/**/*.test.ts'], environment: 'node',
          fileParallelism: false, testTimeout: 20_000,
          env: { DATABASE_URL: 'postgres://lms:lms-spike-only@localhost:54329/lms_spike', BETTER_AUTH_SECRET: 'spike-secret-0123456789-abcdefghijklmnop', BETTER_AUTH_URL: 'http://lms.localhost:3101' },
        },
      },
    ],
  },
});
