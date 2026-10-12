import { expect, test } from '@playwright/test';

function assertNoSecrets(value: unknown): void {
  const json = JSON.stringify(value);
  expect(json).not.toMatch(/"(?:(?:access|refresh|id)[_-]?token|OAuthToken|client_secret)"\s*:/i);
}

test.describe('Zitadel authenticated session / BFF', () => {
  test('session is server-validated and JWTs never appear in browser API JSON', async ({
    request,
    context,
  }) => {
    const cookies = await context.cookies();
    const authCookie = cookies.find((cookie) => cookie.name === 'auth-tokens');
    expect(authCookie).toBeDefined();
    expect(authCookie?.httpOnly).toBe(true);
    if (new URL(process.env.E2E_BASE_URL!).protocol === 'https:') {
      expect(authCookie?.secure).toBe(true);
    }
    for (const endpoint of ['/api/auth/token', '/api/auth/session']) {
      const res = await request.get(endpoint);
      expect(res.status(), endpoint).toBe(200);
      expect(res.headers()['cache-control']).toContain('no-store');
      assertNoSecrets(await res.json());
    }
  });

  test('a browser reload retains access to a protected user page', async ({ page }) => {
    await page.goto('/en/my-day');
    await expect(page).toHaveURL(/\/en\/my-day(?:\?.*)?$/);
    await page.reload();
    await expect(page).toHaveURL(/\/en\/my-day(?:\?.*)?$/);
    expect(await page.request.get('/api/auth/session').then((r) => r.status())).toBe(200);
  });

  test('same-origin browser API reads are authorized but never cached publicly', async ({
    request,
  }) => {
    const res = await request.get('/api/backend/mood-record');
    expect(res.status()).not.toBe(401);
    expect(res.status()).not.toBe(403);
    expect(res.headers()['cache-control']).toContain('no-store');
    expect(res.headers()['set-cookie']).toBeUndefined();
  });

  test('normal user cannot navigate to administrator UI', async ({ request }) => {
    const session = await (await request.get('/api/auth/session')).json();
    expect(session.role).not.toBe('admin');
    const response = await request.get('/en/admin', { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(response.status());
    const url = new URL(response.headers().location, process.env.E2E_BASE_URL);
    expect(url.pathname).toBe('/en/auth');
  });

  test('cross-tenant resource ID is inaccessible', async ({ request }) => {
    const path = process.env.E2E_FOREIGN_RESOURCE_PATH;
    expect(path, 'Foreign-tenant fixture is required').toBeTruthy();
    expect(path).toMatch(/^\/api\/backend\/[A-Za-z0-9/_?&=.%~-]+$/);
    const res = await request.get(path!);
    expect([403, 404]).toContain(res.status());
  });

  test('cross-origin refresh is forbidden and cannot rotate the session', async ({ request }) => {
    const res = await request.post('/api/auth/exchange', {
      data: { grantType: 'refresh_token' },
      headers: { origin: 'https://attacker.invalid' },
    });
    expect(res.status()).toBe(403);
  });
  test('refresh rotates server cookie without browser JWTs, then logout clears it', async ({
    request,
  }) => {
    const origin = new URL(process.env.E2E_BASE_URL!).origin;
    const before = await request.get('/api/auth/token');
    expect(before.status()).toBe(200);
    const metadata = await before.json();
    expect(metadata.hasRefreshToken).toBe(true);

    const refreshed = await request.post('/api/auth/exchange', {
      headers: { origin },
      data: { grantType: 'refresh_token' },
    });
    expect(refreshed.status()).toBe(200);
    expect(refreshed.headers()['cache-control']).toContain('no-store');
    const newMetadata = await refreshed.json();
    assertNoSecrets(newMetadata);
    expect(newMetadata.hasRefreshToken).toBe(true);
    expect(refreshed.headers()['set-cookie']).toMatch(/HttpOnly/i);

    const logout = await request.post('/api/auth/logout', {
      headers: { origin },
      maxRedirects: 0,
      data: {},
    });
    expect(logout.status()).toBe(303);
    const location = new URL(logout.headers().location);
    expect(location.protocol).toBe('https:');
    expect(location.pathname).toBe('/oidc/v1/end_session');
    expect(logout.headers()['set-cookie']).toContain('auth-tokens=');

    const after = await request.get('/api/auth/session');
    expect(after.status()).toBe(401);
  });
});
