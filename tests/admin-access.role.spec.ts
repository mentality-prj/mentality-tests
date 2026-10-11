import { expect, test } from '@playwright/test';

test('backend-verified administrator accesses the admin UI', async ({ request, page }) => {
  const session = await request.get('/api/auth/session');
  expect(session.status()).toBe(200);
  expect((await session.json()).role).toBe('admin');

  const response = await request.get('/en/admin', { maxRedirects: 0 });
  expect(response.status()).toBe(200);

  await page.goto('/en/admin');
  await expect(page).toHaveURL(/\/en\/admin(?:\?.*)?$/);
});
