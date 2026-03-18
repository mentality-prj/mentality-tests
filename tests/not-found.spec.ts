import { test, expect } from '@playwright/test';

test('Page not found — 404 page', async ({ page }) => {
  await page.goto('https://mentality-web.vercel.app/en/this-page-does-not-exist');

  await expect(page.getByRole('heading', { name: 'Page not found', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/en');
});
