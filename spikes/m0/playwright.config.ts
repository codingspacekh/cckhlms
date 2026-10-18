import { defineConfig, devices } from '@playwright/test';

// LMS at lms.localhost:3101, preview at preview.localhost:3102: two different hosts, like lms.cckh.dev and preview.cckh.dev.
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://lms.localhost:3101', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run start', url: 'http://localhost:3101/api/health', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npm run preview', url: 'http://localhost:3102/health', reuseExistingServer: true },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
  ],
});
