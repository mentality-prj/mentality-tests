import { expect, test } from '@playwright/test';

function mandatory(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error('Real Zitadel E2E requires ' + name);
  return value;
}

test('real Zitadel authorization-code + PKCE login round-trip', async ({ page, context }) => {
  const username = mandatory('E2E_ZITADEL_USERNAME');
  const password = mandatory('E2E_ZITADEL_PASSWORD');
  // Explicit selectors avoid making guesses about the tenant-specific Zitadel login UI.
  const usernameSelector = mandatory('E2E_ZITADEL_USERNAME_SELECTOR');
  const passwordSelector = mandatory('E2E_ZITADEL_PASSWORD_SELECTOR');
  const submitSelector = mandatory('E2E_ZITADEL_SUBMIT_SELECTOR');
  const origin = new URL(process.env.E2E_BASE_URL!).origin;

  const authorizeRequests: URL[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin && url.pathname.endsWith('/oauth/v2/authorize')) {
      authorizeRequests.push(url);
    }
  });

  await page.goto('/en/auth');
  await page.waitForURL((url) => url.origin !== origin, { timeout: 30_000 });
  await expect
    .poll(() => authorizeRequests.length, { message: 'OIDC authorization URL was not requested' })
    .toBeGreaterThan(0);
  const authorize = authorizeRequests[0].searchParams;
  expect(authorize.get('response_type')).toBe('code');
  expect(authorize.get('code_challenge_method')).toBe('S256');
  expect(authorize.get('code_challenge')).toBeTruthy();
  expect(authorize.get('state')).toBeTruthy();

  await page.locator(usernameSelector).fill(username);
  if (await page.locator(passwordSelector).isVisible()) {
    await page.locator(passwordSelector).fill(password);
    await page.locator(submitSelector).click();
  } else {
    await page.locator(submitSelector).click();
    await page.locator(passwordSelector).fill(password);
    await page.locator(submitSelector).click();
  }

  await page.waitForURL(
    (url) => url.origin === origin && /^\/(en|uk|pl)\/my-day$/.test(url.pathname),
    { timeout: 60_000 },
  );
  const cookie = (await context.cookies()).find((item) => item.name === 'auth-tokens');
  expect(cookie?.httpOnly).toBe(true);

  const result = await page.request.get('/api/auth/session');
  expect(result.status()).toBe(200);
  expect(JSON.stringify(await result.json())).not.toMatch(/"(accessToken|refreshToken|idToken)":/);
});
