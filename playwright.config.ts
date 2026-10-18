import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';
import { AUTH_STATE_PATH } from './global-setup';

const runAuth = process.env.RUN_AUTH_E2E === '1';
const runLogin = process.env.RUN_LOGIN_E2E === '1';
const runRoles = process.env.RUN_ROLE_E2E === '1';
const runLifecycle = process.env.RUN_LIFECYCLE_E2E === '1';
const runMoodMutation = process.env.RUN_MOOD_MUTATION_E2E === '1';
const runMoodHistory = process.env.RUN_MOOD_HISTORY_E2E === '1';
const runQdipAdmin = process.env.RUN_QDIP_ADMIN_E2E === '1';
const runB2B = process.env.RUN_B2B_E2E === '1';
const runTwoQa = process.env.RUN_TWO_QA_E2E === '1';
const runB2c = process.env.RUN_B2C_E2E === '1';
const baseURL = process.env.E2E_BASE_URL;

if (
  !baseURL &&
  (process.env.RUN_REMOTE_SMOKE === '1' ||
    runAuth ||
    runLogin ||
    runRoles ||
    runLifecycle ||
    runMoodMutation ||
    runMoodHistory ||
    runB2B ||
    runTwoQa ||
    runB2c ||
    runQdipAdmin)
) {
  throw new Error('E2E_BASE_URL is required for remote browser tests');
}

// No project uses a production account or a cached Google OAuth session by default.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.RUN_RELEASE_QUALIFICATION === '1' ? 0 : process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 40_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'list' : 'html',
  globalSetup:
    runAuth ||
    runRoles ||
    runLifecycle ||
    runMoodMutation ||
    runMoodHistory ||
    runB2c ||
    runQdipAdmin ||
    runB2B
      ? './global-setup.ts'
      : undefined,
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
    ...(runMoodHistory
      ? [
          {
            name: 'mood-history-api-chromium',
            testMatch: '**/*.history.spec.ts',
            use: {
              ...devices['Desktop Chrome'],
              storageState: AUTH_STATE_PATH,
            },
          },
        ]
      : []),
    ...(runQdipAdmin
      ? [
          {
            name: 'qdip-admin-chromium',
            testMatch: '**/*.qdip.spec.ts',
            use: {
              ...devices['Desktop Chrome'],
              storageState: 'playwright/.auth/zitadel-admin.json',
            },
          },
        ]
      : []),
    ...(runB2B
      ? [
          {
            name: 'b2b-isolation-chromium',
            testMatch: '**/*.b2b.spec.ts',
            use: {
              ...devices['Desktop Chrome'],
              storageState: { cookies: [], origins: [] },
            },
          },
        ]
      : []),
    ...(runTwoQa
      ? [
          {
            name: 'two-qa-company-chromium',
            testMatch: '**/*.pair.spec.ts',
            use: {
              ...devices['Desktop Chrome'],
              storageState: { cookies: [], origins: [] },
            },
          },
        ]
      : []),
    ...(runB2c
      ? [
          {
            name: 'b2c-isolation-chromium',
            testMatch: '**/*.b2c.spec.ts',
            use: {
              ...devices['Desktop Chrome'],
              storageState: { cookies: [], origins: [] },
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
