import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
import { AUTH_STATE_PATH } from './global-setup';

const runAuth = process.env.RUN_AUTH_E2E === '1';
const runLogin = process.env.RUN_LOGIN_E2E === '1';
const runRoles = process.env.RUN_ROLE_E2E === '1';
const runLifecycle = process.env.RUN_LIFECYCLE_E2E === '1';
const runMoodMutation = process.env.RUN_MOOD_MUTATION_E2E === '1';
const baseURL = process.env.E2E_BASE_URL;

if (
  !baseURL &&
  (process.env.RUN_REMOTE_SMOKE === '1' ||
    runAuth ||
    runLogin ||
    runRoles ||
    runLifecycle ||
    runMoodMutation)
) {
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
  globalSetup:
    runAuth || runRoles || runLifecycle || runMoodMutation ? './global-setup.ts' : undefined,
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
    ...(runRoles
      ? [
          {
            name: 'admin-role-chromium',
            testMatch: '**/admin-access.role.spec.ts',
            use: {
              ...devices['Desktop Chrome'],
              storageState: 'playwright/.auth/zitadel-admin.json',
            },
          },
          {
            name: 'company-role-chromium',
            testMatch: '**/company-access.role.spec.ts',
            use: {
              ...devices['Desktop Chrome'],
              storageState: 'playwright/.auth/zitadel-company.json',
            },
          },
          {
            name: 'research-role-chromium',
            testMatch: '**/research-access.role.spec.ts',
            use: {
              ...devices['Desktop Chrome'],
              storageState: 'playwright/.auth/zitadel-research.json',
            },
          },
        ]
      : []),
    ...(runLifecycle
      ? [
          {
            name: 'refresh-concurrency-chromium',
            testMatch: '**/*.lifecycle.spec.ts',
            use: {
              ...devices['Desktop Chrome'],
              storageState: 'playwright/.auth/zitadel-lifecycle.json',
            },
          },
        ]
      : []),
    ...(runMoodMutation
      ? [
          {
            name: 'disposable-mood-mutation-chromium',
            testMatch: '**/*.mutation.spec.ts',
            use: {
              ...devices['Desktop Chrome'],
              storageState: 'playwright/.auth/zitadel-mutation.json',
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
