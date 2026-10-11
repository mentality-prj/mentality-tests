import { expect, test } from '@playwright/test';

test('expired session refresh remains valid during concurrent tab navigation', async ({
  context,
  page,
}) => {
  const cookie = (await context.cookies()).find((entry) => entry.name === 'auth-tokens');
  expect(cookie?.httpOnly).toBe(true);
  if (!cookie) throw new Error('Missing dedicated lifecycle session');

  let tokens: { expiresAt: number };
  try {
    tokens = JSON.parse(cookie.value) as { expiresAt: number };
  } catch {
    tokens = JSON.parse(decodeURIComponent(cookie.value)) as { expiresAt: number };
  }
  expect(typeof tokens.expiresAt).toBe('number');
  tokens.expiresAt = Math.floor(Date.now() / 1000) - 10;
  await context.addCookies([{ ...cookie, value: JSON.stringify(tokens) }]);

  const secondTab = await context.newPage();
  const navigations = await Promise.all([
    page.goto('/en/my-day', { waitUntil: 'domcontentloaded' }),
    secondTab.goto('/en/my-day', { waitUntil: 'domcontentloaded' }),
  ]);

  for (const result of navigations) {
    expect(result).not.toBeNull();
    expect(result?.status()).toBeLessThan(500);
  }
  await expect(page).toHaveURL(/\/en\/my-day(?:\?.*)?$/);
  await expect(secondTab).toHaveURL(/\/en\/my-day(?:\?.*)?$/);

  const session = await page.request.get('/api/auth/session');
  expect(session.status()).toBe(200);
  const latest = await page.request.get('/api/auth/token');
  expect(latest.status()).toBe(200);
  const metadata = await latest.json();
  expect(metadata.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  expect(JSON.stringify(metadata)).not.toMatch(/"(accessToken|idToken|refreshToken)":/);
});
