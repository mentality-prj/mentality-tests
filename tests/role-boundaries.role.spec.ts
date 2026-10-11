import { expect, test } from '@playwright/test';

test('verified privileged identity accesses only its permitted workspace', async ({
  request,
  page,
}, testInfo) => {
  const name = testInfo.project.name;
  const session = await request.get('/api/auth/session');
  expect(session.status()).toBe(200);

  if (name === 'admin-role-chromium') {
    const admin = await request.get('/en/admin', { maxRedirects: 0 });
    expect(admin.status()).toBe(200);
    await page.goto('/en/admin');
    await expect(page).toHaveURL(/\/en\/admin(?:\?.*)?$/);
  } else if (name === 'company-role-chromium') {
    const company = await request.get('/en/company', { maxRedirects: 0 });
    expect(company.status()).toBe(200);
    const admin = await request.get('/en/admin', { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(admin.status());
  } else if (name === 'research-role-chromium') {
    await page.goto('/en/research');
    await expect(page).toHaveURL(/\/en\/research(?:\?.*)?$/);
    await expect(page.getByText('Research Workspace', { exact: true })).toBeVisible();
    await expect(page.getByText('Access denied', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Research workspace unavailable', { exact: true })).toHaveCount(0);
    const admin = await request.get('/en/admin', { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(admin.status());
  } else {
    throw new Error('Unrecognized privileged test project: ' + name);
  }
});
