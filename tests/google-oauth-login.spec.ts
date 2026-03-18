import { test, expect } from '@playwright/test';

// Authentication is handled once by global-setup.ts which saves storageState.json.
// Google OAuth cannot be replayed in automated browsers (Google blocks them as insecure).
// The storageState carries a valid NextAuth.js session so tests start already logged in.

test('Google OAuth login for mentality-web', async ({ page }) => {
  // Open a protected page — the storageState session should grant direct access
  await page.goto('https://mentality-web.vercel.app/en/my-day');

  // Confirm we are NOT redirected back to signin (session is active)
  await expect(page).not.toHaveURL(/\/signin/, { timeout: 10_000 });

  // Verify the authenticated UI is present — sidebar is only rendered for logged-in users
  await expect(page.getByRole('complementary')).toBeVisible({ timeout: 10_000 });
});
