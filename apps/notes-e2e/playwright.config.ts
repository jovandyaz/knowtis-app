import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

import { E2E } from './support/environment';

export default defineConfig({
  ...nxE2EPreset(import.meta.filename, { testDir: './src' }),
  globalSetup: './support/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  maxFailures: 1,
  forbidOnly: true,
  timeout: 120_000,
  globalTimeout: 10 * 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: '../../dist/.playwright/apps/notes-e2e/report',
        open: 'never',
      },
    ],
  ],
  use: {
    baseURL: E2E.frontend,
    ...devices['Desktop Chrome'],
    channel: process.env['SHARING_E2E_BROWSER_CHANNEL'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },
  projects: [{ name: 'chromium' }],
});
