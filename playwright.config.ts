import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// E2E runs against a production build on lms.localhost:3100 (own database lms_e2e) and the preview
// stand-in on preview.localhost:3102: two hosts, like lms.cckh.dev and preview.cckh.dev.
export const E2E = {
  lms: 'http://lms.localhost:3100',
  preview: 'http://preview.localhost:3102',
  databaseUrl: process.env.E2E_DATABASE_URL ?? 'postgres://lms:lms-dev-only@localhost:54329/lms_e2e',
  secret: 'e2e-secret-0123456789-abcdefghijklmnopqrstuv',
  // The code runner (M11): `npm run runner:up` on a laptop (compose.yaml), started by CI before the tests.
  runner: process.env.E2E_RUNNER_URL ?? 'http://127.0.0.1:8090',
  runnerToken: 'dev-runner-token',
};

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: { baseURL: E2E.lms, trace: 'retain-on-failure' },
  // Never reuse a server that is already running: one left over from an interrupted run (or `npm run dev`'s preview
  // on :3102) has another build or another LMS address, and the tests would quietly run against it. A port in use
  // stops the run instead; free it with `lsof -ti tcp:3100,3102 | xargs kill`.
  webServer: [
    {
      command: 'node scripts/ensure-db.mjs && sh scripts/start-standalone.sh',
      url: 'http://localhost:3100/api/health',
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        DATABASE_URL: E2E.databaseUrl,
        BETTER_AUTH_URL: E2E.lms,
        BETTER_AUTH_SECRET: E2E.secret,
        PREVIEW_ORIGIN: E2E.preview,
        UPLOADS_DIR: path.resolve('test-results/uploads-e2e'),
        RUNNER_URL: E2E.runner,
        RUNNER_TOKEN: E2E.runnerToken,
      },
    },
    {
      command: 'node preview/server.mjs',
      url: 'http://localhost:3102/health',
      reuseExistingServer: false,
      env: { LMS_ORIGIN: E2E.lms, PREVIEW_PORT: '3102' },
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
  ],
});
