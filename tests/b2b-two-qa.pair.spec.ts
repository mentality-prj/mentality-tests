import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext } from '@playwright/test';

type TestActor = {
  context: BrowserContext;
  id: string;
  email: string;
  companyId: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(name + ' is required for two-account E2E');
  return value;
}

async function authenticate(
  browser: Browser,
  baseURL: string,
  usernameKey: string,
  passwordKey: string,
): Promise<TestActor> {
  const email = required(usernameKey);
  const password = required(passwordKey);
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    await page.goto('/en/auth');
    const username = page.locator(required('E2E_ZITADEL_USERNAME_SELECTOR'));
    const passwordInput = page.locator(required('E2E_ZITADEL_PASSWORD_SELECTOR'));
    const submit = page.locator(required('E2E_ZITADEL_SUBMIT_SELECTOR'));
    await username.fill(email);
    if (!(await passwordInput.isVisible())) {
      await submit.click();
    }
    await passwordInput.fill(password);
    await submit.click();

    await expect
      .poll(async () => (await context.request.get('/api/auth/session')).status(), {
        timeout: 60_000,
        message: 'Real Zitadel login must establish a valid backend session',
      })
      .toBe(200);
    const sessionResponse = await context.request.get('/api/auth/session');
    const session = (await sessionResponse.json()) as {
      id?: string;
      email?: string;
      companyId?: string | null;
    };
    expect(session.email?.toLowerCase(), 'Zitadel identity must match QA account').toBe(
      email.toLowerCase(),
    );
    expect(session.id, 'Backend must bind a unique authenticated user').toBeTruthy();
    const authCookie = (await context.cookies()).find((cookie) => cookie.name === 'auth-tokens');
    expect(authCookie?.httpOnly, 'Real session cookie must be HttpOnly').toBe(true);

    const memberships = await context.request.get('/api/backend/companies/mine');
    expect(memberships.status(), 'Company selector must be authenticated').toBe(200);
    const companies = (await memberships.json()) as Array<{ id: string }>;
    expect(companies, 'QA actor must belong to exactly one isolated test company').toHaveLength(
      1,
    );
    expect(companies[0]?.id).toMatch(/^[0-9a-f]{24}$/i);

    return {
      context,
      id: session.id!,
      email,
      companyId: companies[0].id,
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

test('qa1 and qa2 cannot read or select each other\'s company', async ({
  browser,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  let first: TestActor | undefined;
  let second: TestActor | undefined;
  try {
    first = await authenticate(browser, origin, 'E2E_QA1_USERNAME', 'E2E_QA1_PASSWORD');
    second = await authenticate(browser, origin, 'E2E_QA2_USERNAME', 'E2E_QA2_PASSWORD');

    expect(first.id, 'QA users must resolve to different backend identities').not.toBe(second.id);
    expect(first.companyId, 'QA users must belong to distinct isolated companies').not.toBe(
      second.companyId,
    );

    for (const [actor, foreign] of [
      [first, second],
      [second, first],
    ] as const) {
      const owned = await actor.context.request.get(
        '/api/backend/companies/' + actor.companyId,
      );
      expect(owned.status(), 'Owner must access their company').toBe(200);
      for (const suffix of [
        '',
        '/groups',
        '/employees',
        '/invites',
        '/access-scopes',
        '/salary-grades',
        '/analytics/mood',
      ]) {
        const path = '/api/backend/companies/' + foreign.companyId + suffix;
        const response = await actor.context.request.get(path, { maxRedirects: 0 });
        expect([403, 404], 'Foreign tenant request must be denied: ' + suffix).toContain(
          response.status(),
        );
        expect(response.headers()['cache-control'], 'Denied data must not be cached').toContain(
          'no-store',
        );
      }

      const switchTenant = await actor.context.request.post('/api/company-context', {
        headers: { origin },
        form: { companyId: foreign.companyId, locale: 'en' },
        maxRedirects: 0,
      });
      expect(switchTenant.status(), 'Foreign company selection must be denied').toBe(403);
      expect(switchTenant.headers()['set-cookie']).toBeUndefined();

      const forged = await actor.context.request.get(
        '/api/backend/companies/' + foreign.companyId + '/groups',
        { headers: { 'x-company-id': foreign.companyId, 'x-company-role': 'superuser' } },
      );
      expect([403, 404], 'Forged company header must not authorize access').toContain(
        forged.status(),
      );
    }
  } finally {
    await Promise.all([first?.context.close(), second?.context.close()]);
  }
});
