import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests. Run them with `pnpm test:e2e:web` from the repo root: that
 * script starts the API against the *test* database and a production build
 * of the web app on 127.0.0.1, seeds test users, and cleans up afterwards.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  // One shared test database and per-username login limits: run serially.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100',
    locale: 'th-TH',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile\.spec\.ts/,
    },
    // Mobile emulation with Chromium only (D2/D3): real phones after Phase 7 HTTPS.
    {
      name: 'pixel-7',
      use: { ...devices['Pixel 7'] },
      testMatch: /mobile\.spec\.ts/,
    },
    {
      name: 'iphone-13',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
