import { expect, test } from '@playwright/test';

test('company identity accesses company, but not global admin', async ({ request }) => {
  const session = await request.get('/api/auth/session');
  expect(session.status()).toBe(200);

  const companyPage = await request.get('/en/company', { maxRedirects: 0 });
  expect(companyPage.status()).toBe(200);

  const adminPage = await request.get('/en/admin', { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(adminPage.status());
  expect(new URL(adminPage.headers().location).pathname).toBe('/en/auth');
});
