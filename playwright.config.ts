import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
import { AUTH_STATE_PATH, prepareAuthState } from './global-setup';

const runAuth = process.env.RUN_AUTH_E2E === '1';
const runLogin = process.env.RUN_LOGIN_E2E === '1';
const baseURL = process.env.E2E_BASE_URL;

if (!baseURL && (process.env.RUN_REMOTE_SMOKE === '1' || runAuth || runLogin)) {
  throw new Error('E2E_BASE_URL is required for remote browser tests');
}

// No project uses a production account or a cached Google OAuth session by default.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 40_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'list' : 'html',
  globalSetup: runAuth ? prepareAuthState : undefined,
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    actionTimeout: 12_000,
  },
  projects: [
    {
      name: 'public-chromium',
      testMatch: '**/*.public.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [] },
      },
    },
    ...(runAuth
      ? [
          {
            name: 'authenticated-chromium',
            testMatch: '**/*.auth.spec.ts',
            use: {
              ...devices['Desktop Chrome'],
              storageState: AUTH_STATE_PATH,
            },
          },
        ]
      : []),
    ...(runLogin
      ? [
          {
            name: 'zitadel-login-chromium',
            testMatch: '**/*.login.spec.ts',
            use: {
              ...devices['Desktop Chrome'],
              storageState: { cookies: [], origins: [] },
            },
          },
        ]
      : []),
  ],
});
