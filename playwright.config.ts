import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE_PATH } from './global-setup';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: require.resolve('./global-setup'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    storageState: STORAGE_STATE_PATH,
    trace: 'on-first-retry',
  },

  projects: [
    {
      // Uses the real installed Chrome locally to avoid Google's automation detection.
      // In CI the channel falls back to Playwright's bundled Chromium (storageState covers auth).
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.CI ? undefined : 'chrome',
        launchOptions: {
          args: ['--disable-blink-features=AutomationControlled'],
        },
      },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
