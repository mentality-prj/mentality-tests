import { expect, test } from '@playwright/test';
import type { APIRequestContext, Browser, BrowserContext, Locator } from '@playwright/test';

const API = '/api/backend/learning/feedback';
const ID = /^[a-f0-9]{24}$/i;
type Feedback = { category: string; helpful: boolean };
type Actor = { context: BrowserContext; userId: string };

function requireApprovedPreview(baseURL: string | undefined): string {
  if (!baseURL) throw new Error('E2E_BASE_URL is required');
  const url = new URL(baseURL);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.origin !== process.env.E2E_ALLOWED_MUTATION_ORIGIN ||
    url.pathname !== '/' ||
    Boolean(url.search || url.hash || url.username || url.password || url.port) ||
    host === 'dzvin.co' ||
    host.endsWith('.dzvin.co') ||
    host === 'mentality-web.vercel.app' ||
    host.includes('-git-production-') ||
    process.env.E2E_DISPOSABLE_TENANT_CONFIRMED !== '1' ||
    process.env.E2E_DZVIN_FEEDBACK_RESET_APPROVED !== '1'
  ) {
    throw new Error('B2C feedback writes require an explicitly approved disposable QA preview');
  }
  for (const sha of ['E2E_DZVIN_WEB_SHA', 'E2E_DZVIN_BACK_SHA']) {
    if (!/^[a-f0-9]{40}$/i.test(process.env[sha] ?? '')) {
      throw new Error(sha + ' must identify an independently verified deployed SHA');
    }
  }
  return url.origin;
}

async function openActor(
  browser: Browser,
  origin: string,
  statePath: string,
  expectedId: string,
): Promise<Actor> {
  expect(expectedId, 'Pinned QA userId is required').toMatch(ID);
  const context = await browser.newContext({ baseURL: origin, storageState: statePath });
  try {
    const response = await context.request.get('/api/auth/session', { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const session = (await response.json()) as { id?: string; role?: string };
    expect(session.id, 'QA account identity must match the approved subject').toBe(expectedId);
    expect(session.role, 'Do not use a platform administrator in B2C tests').not.toBe('admin');
    return { context, userId: expectedId };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function readFeedback(api: APIRequestContext): Promise<Feedback[]> {
  const response = await api.get(API, { maxRedirects: 0 });
  expect(response.status(), 'Real NestJS feedback endpoint must be available').toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  const body = (await response.json()) as unknown;
  expect(Array.isArray(body)).toBe(true);
  return body as Feedback[];
}

async function save(api: APIRequestContext, origin: string, category: string, helpful: boolean) {
  const response = await api.post(API, {
    headers: { Origin: origin },
    data: { category, helpful },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(201);
  expect(await response.json()).toEqual({ category, helpful });
}

async function requireHydratedClick(button: Locator): Promise<void> {
  await expect(button).toBeVisible();
  await expect
    .poll(
      () =>
        button.evaluate((element) =>
          Object.keys(element).some((key) => {
            if (!key.startsWith('__reactProps')) return false;
            const props = (element as unknown as Record<string, unknown>)[key];
            return (
              typeof props === 'object' &&
              props !== null &&
              'onClick' in props &&
              typeof props.onClick === 'function'
            );
          }),
        ),
      { message: 'REACT_FEEDBACK_BUTTON_NOT_HYDRATED', timeout: 15_000 },
    )
    .toBe(true);
}

test('Dzvin B2C: two actual accounts, editable feedback, My Progress and safe teardown', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150_000);
  const origin = requireApprovedPreview(baseURL);
  let a: Actor | undefined;
  let b: Actor | undefined;
  let anonymous: BrowserContext | undefined;
  let verifiedEmptyBaseline = false;

  try {
    a = await openActor(
      browser,
      origin,
      'playwright/.auth/b2c-a.json',
      process.env.E2E_QA_A_USER_ID ?? '',
    );
    b = await openActor(
      browser,
      origin,
      'playwright/.auth/b2c-b.json',
      process.env.E2E_QA_B_USER_ID ?? '',
    );
    expect(a.userId).not.toBe(b.userId);

    // Fail before any mutation if these are not already-reset disposable accounts.
    expect(await readFeedback(a.context.request)).toEqual([]);
    expect(await readFeedback(b.context.request)).toEqual([]);
    verifiedEmptyBaseline = true;

    anonymous = await browser.newContext({
      baseURL: origin,
      storageState: { cookies: [], origins: [] },
    });
    expect((await anonymous.request.get(API, { maxRedirects: 0 })).status()).toBe(401);
    expect(
      (await anonymous.request.post(API, { headers: { Origin: origin }, data: { category: 'breathing', helpful: true } })).status(),
    ).toBe(401);

    const csrf = await a.context.request.post(API, {
      headers: { Origin: 'https://untrusted.invalid' },
      data: { category: 'breathing', helpful: true },
    });
    expect(csrf.status(), 'Cross-origin write must be rejected').toBe(403);

    for (const body of [
      { category: 'unknown', helpful: true },
      { category: 'breathing', helpful: 'true' },
    ]) {
      const invalid = await a.context.request.post(API, { headers: { Origin: origin }, data: body });
      expect(invalid.status(), 'Invalid category/type must not be accepted').toBe(400);
    }

    await save(a.context.request, origin, 'breathing', true);
    expect(await readFeedback(a.context.request)).toEqual([{ category: 'breathing', helpful: true }]);
    expect(await readFeedback(b.context.request)).toEqual([]);

    await save(b.context.request, origin, 'focus', false);
    expect(await readFeedback(b.context.request)).toEqual([{ category: 'focus', helpful: false }]);
    expect(await readFeedback(a.context.request)).toEqual([{ category: 'breathing', helpful: true }]);

    const page = await a.context.newPage();
    expect((await page.goto('/en/guide/breathing', { waitUntil: 'domcontentloaded' }))?.status()).toBe(200);
    const helpful = page.getByRole('button', { name: 'Helpful', exact: true });
    const notHelpful = page.getByRole('button', { name: 'Not helpful', exact: true });
    await expect(helpful, 'SSR must load the owner rating').toHaveAttribute('aria-pressed', 'true');
    await requireHydratedClick(notHelpful);
    await notHelpful.click();
    await expect(notHelpful).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => readFeedback(a!.context.request)).toEqual([
      { category: 'breathing', helpful: false },
    ]);

    expect((await page.goto('/en/my-progress', { waitUntil: 'domcontentloaded' }))?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: "Activities you've rated" })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Breathing exercises' })).toBeVisible();
    await expect(page.getByText('You marked: “Not helpful”')).toBeVisible();

    const otherPage = await b.context.newPage();
    expect((await otherPage.goto('/en/my-progress', { waitUntil: 'domcontentloaded' }))?.status()).toBe(200);
    await expect(otherPage.getByRole('heading', { name: 'Attention Sprint' })).toBeVisible();
    await expect(otherPage.getByRole('heading', { name: 'Breathing exercises' })).toHaveCount(0);

    const clear = await a.context.request.delete(API + '/breathing', {
      headers: { Origin: origin },
    });
    expect(clear.status()).toBe(200);
    expect(await clear.json()).toEqual({ category: 'breathing', cleared: true });
    expect(await readFeedback(a.context.request)).toEqual([]);
    expect(await readFeedback(b.context.request)).toEqual([{ category: 'focus', helpful: false }]);
  } finally {
    try {
      // Only touch categories created by this run after proving BOTH baselines were empty.
      if (verifiedEmptyBaseline && a && b) {
        for (const [actor, category] of [[a, 'breathing'], [b, 'focus']] as const) {
          const identity = await actor.context.request.get('/api/auth/session');
          expect(identity.status()).toBe(200);
          expect(((await identity.json()) as { id?: string }).id).toBe(actor.userId);
          const result = await actor.context.request.delete(API + '/' + category, {
            headers: { Origin: origin },
          });
          expect(result.status(), 'QA cleanup must be acknowledged').toBe(200);
          expect(await readFeedback(actor.context.request)).toEqual([]);
        }
      }
    } finally {
      await Promise.all([anonymous?.close(), a?.context.close(), b?.context.close()]);
    }
    // Never report a live E2E pass without this cleanup and a pinned release deployment.
  }
});
