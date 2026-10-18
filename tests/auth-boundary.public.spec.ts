import { expect, test } from '@playwright/test';

test.describe('Anonymous authentication and BFF boundaries', () => {
  test('protected pages redirect an anonymous visitor to authentication', async ({ request }) => {
    for (const path of ['/en/my-day', '/en/admin', '/en/company']) {
      const result = await request.get(path, { maxRedirects: 0 });
      expect([302, 303, 307, 308], path).toContain(result.status());
      const target = new URL(result.headers().location, process.env.E2E_BASE_URL);
      expect(target.pathname, path).toBe('/en/auth');
      expect(target.origin).toBe(new URL(process.env.E2E_BASE_URL!).origin);
    }
  });

  test('token and session endpoints never disclose anonymous credentials', async ({ request }) => {
    for (const path of ['/api/auth/token', '/api/auth/session']) {
      const result = await request.get(path);
      expect(result.status(), path).toBe(401);
      expect(result.headers()['cache-control']).toContain('no-store');
      expect(await result.text()).not.toMatch(/access[_-]?token|refresh[_-]?token|id[_-]?token/i);
    }
  });

  test('legacy browser JWT cookie writes are disabled', async ({ request }) => {
    const result = await request.post('/api/auth/token', {
      data: { accessToken: 'attacker', idToken: 'attacker' },
      headers: { origin: new URL(process.env.E2E_BASE_URL!).origin },
    });
    expect(result.status()).toBe(405);
    expect(result.headers()['cache-control']).toContain('no-store');
  });

  test('anonymous backend BFF reads cannot disclose private records', async ({ request }) => {
    const result = await request.get('/api/backend/mood-record');
    expect(result.status()).toBe(401);
    expect(result.headers()['cache-control']).toContain('no-store');
  });

  test('anonymous QDIP Gate 3 admin reads and reconciliation cannot expose records', async ({
    request,
  }) => {
    for (const path of [
      '/api/backend/dip-admin/organizations',
      '/api/backend/dip-admin/mutations/reconciliation?limit=1',
      '/api/backend/dip-admin/organizations/qdip-gate3-probe/keys',
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });
      // In a B2C-only release, privileged API families are deliberately absent
      // (404); on the full application anonymous callers receive 401.
      const expectedStatus = process.env.E2E_B2C_ONLY === '1' ? 404 : 401;
      expect(response.status(), path).toBe(expectedStatus);
      expect(response.headers()['cache-control'], path).toContain('no-store');
      expect(response.headers()['location'], path).toBeUndefined();
      const payload = await response.text();
      expect(payload).not.toMatch(/idempotencyKey|actorSub|key_hash|access_token|refresh_token/);
    }
  });

  test('cross-origin backend mutations are rejected before session checks', async ({ request }) => {
    const result = await request.post('/api/backend/mood-record', {
      data: { moodLevel: 4 },
      headers: { origin: 'https://attacker.invalid' },
    });
    expect(result.status()).toBe(403);
    expect(result.headers()['cache-control']).toContain('no-store');
  });

  test('cross-origin session deletion and logout are rejected', async ({ request }) => {
    const origin = 'https://attacker.invalid';
    const deletion = await request.delete('/api/auth/token', { headers: { origin } });
    expect(deletion.status()).toBe(403);
    const logout = await request.post('/api/auth/logout', { headers: { origin }, data: {} });
    expect(logout.status()).toBe(403);
  });

  test('callback with invalid OIDC state cannot establish a session', async ({ page }) => {
    await page.goto('/callback?code=invalid&state=forged');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const session = await page.request.get('/api/auth/session');
    expect(session.status()).toBe(401);
  });
});
