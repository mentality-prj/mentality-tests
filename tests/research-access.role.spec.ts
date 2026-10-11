import { expect, test } from '@playwright/test';

test('scientist / research_admin accesses research, not global admin', async ({
  request,
  page,
}) => {
  expect((await request.get('/api/auth/session')).status()).toBe(200);

  await page.goto('/en/research');
  await expect(page).toHaveURL(/\/en\/research(?:\?.*)?$/);
  await expect(page.getByText('Research Workspace', { exact: true })).toBeVisible();
  await expect(page.getByText('Access denied', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Research workspace unavailable', { exact: true })).toHaveCount(0);

  const admin = await request.get('/en/admin', { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(admin.status());
});
