import { expect, test } from '@playwright/test';
import type { APIRequestContext, Browser, BrowserContext } from '@playwright/test';

const ID = /^[0-9a-f]{24}$/i;
const API = '/api/backend/mood-record';
const PRODUCTION = new Set(['dzvin.co', 'www.dzvin.co', 'mentality-web.vercel.app']);

type MoodRecord = {
  id?: string;
  _id?: string;
  moodLevel?: number;
  createdAt?: string;
};
type Actor = { context: BrowserContext; userId: string };

function approvedOrigin(baseURL: string | undefined): string {
  if (!baseURL) throw new Error('E2E_BASE_URL is required');
  const url = new URL(baseURL);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.origin !== process.env.E2E_ALLOWED_MUTATION_ORIGIN ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    Boolean(url.username || url.password || url.port) ||
    PRODUCTION.has(host) ||
    host.endsWith('.dzvin.co') ||
    host.includes('-git-production-') ||
    process.env.E2E_DISPOSABLE_TENANT_CONFIRMED !== '1' ||
    process.env.E2E_DZVIN_DAILY_RESET_APPROVED !== '1'
  ) {
    throw new Error('Daily-checkin E2E requires an explicitly approved disposable nonproduction tenant');
  }
  for (const key of ['E2E_DZVIN_WEB_SHA', 'E2E_DZVIN_BACK_SHA']) {
    if (!/^[a-f0-9]{40}$/i.test(process.env[key] ?? '')) {
      throw new Error(`${key} must identify the independently verified deployed release SHA`);
    }
  }
  return url.origin;
}

async function actor(browser: Browser, origin: string, statePath: string, expectedUserId: string): Promise<Actor> {
  expect(expectedUserId, 'Expected QA account identity must be configured').toMatch(ID);
  const context = await browser.newContext({ baseURL: origin, storageState: statePath });
  try {
    const response = await context.request.get('/api/auth/session', { maxRedirects: 0 });
    expect(response.status(), 'QA session must be authenticated').toBe(200);
    const session = (await response.json()) as { id?: string; role?: string };
    expect(session.id, 'QA account must match the independently approved identity').toBe(expectedUserId);
    expect(session.role, 'Daily check-in must use an ordinary non-admin account').not.toBe('admin');
    return { context, userId: session.id! };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function last(request: APIRequestContext, zone: string, dailyOnly = true): Promise<MoodRecord[]> {
  const params = new URLSearchParams({
    days: '1',
    limit: '20',
    timeZone: zone,
    ...(dailyOnly ? { dailyOnly: 'true' } : {}),
  });
  const response = await request.get(`${API}/last?${params}`, { maxRedirects: 0 });
  expect(response.status(), 'The deployed NestJS local-day read must be available').toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  const data = (await response.json()) as MoodRecord[];
  expect(Array.isArray(data)).toBe(true);
  return data;
}

function storedId(record: MoodRecord): string {
  const id = record.id ?? record._id;
  expect(id, 'Stored Mongo id').toMatch(ID);
  return id!;
}

async function post(
  request: APIRequestContext,
  origin: string,
  path: string,
  body: Record<string, unknown>,
  zone = 'Europe/Warsaw',
) {
  const query = path === '' ? `?timeZone=${encodeURIComponent(zone)}&withAiExplanation=false` : '';
  return request.post(`${API}${path}${query}`, {
    headers: { Origin: origin },
    data: body,
    maxRedirects: 0,
  });
}

const fullMood = { moodLevel: 3, stressLevel: 2, energyLevel: 4, focusLevel: 3 };

test('Dzvin: real QA1/QA2 local-day admission, micro-events, double-submit, isolation and CSRF', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const origin = approvedOrigin(baseURL);
  let a: Actor | undefined;
  let b: Actor | undefined;
  let anonymous: BrowserContext | undefined;

  try {
    a = await actor(browser, origin, 'playwright/.auth/b2c-a.json', process.env.E2E_QA_A_USER_ID ?? '');
    b = await actor(browser, origin, 'playwright/.auth/b2c-b.json', process.env.E2E_QA_B_USER_ID ?? '');
    expect(a.userId).not.toBe(b.userId);

    // Both disposable users must start without a full check-in today.
    // No mutation happens if the test tenant has not been reset.
    for (const who of [a, b]) {
      expect(await last(who.context.request, 'Europe/Warsaw'), 'Reset disposable QA daily records first').toEqual([]);
    }

    anonymous = await browser.newContext({
      baseURL: origin,
      storageState: { cookies: [], origins: [] },
    });
    const denied = await anonymous.request.get(`${API}/last?days=1&dailyOnly=true`, { maxRedirects: 0 });
    expect(denied.status(), 'Anonymous mood history must be denied').toBe(401);

    const csrf = await a.context.request.post(`${API}?timeZone=Europe%2FWarsaw`, {
      headers: { Origin: 'https://untrusted.invalid' },
      data: fullMood,
      maxRedirects: 0,
    });
    expect(csrf.status(), 'Cross-origin daily check-in must be rejected before write').toBe(403);

    const invalidZone = await a.context.request.get(`${API}/last?days=1&timeZone=Mars%2FPhobos`);
    expect(invalidZone.status(), 'Unrecognized IANA zone must fail').toBe(400);
    const invalidBoolean = await a.context.request.get(`${API}/last?days=1&dailyOnly=maybe`);
    expect(invalidBoolean.status(), 'Malformed boolean must fail').toBe(400);

    const quick = await post(a.context.request, origin, '/quick', { moodLevel: 3 });
    expect(quick.status(), 'Quick check-in must succeed').toBe(201);
    const quickId = storedId((await quick.json()) as MoodRecord);
    const stress = await post(a.context.request, origin, '/stress-spike', { stressLevel: 5 });
    expect(stress.status(), 'Stress spike must succeed').toBe(201);
    const stressId = storedId((await stress.json()) as MoodRecord);
    expect(await last(a.context.request, 'Europe/Warsaw'), 'Micro-events cannot consume daily slot').toEqual([]);
    const allToday = await last(a.context.request, 'Europe/Warsaw', false);
    expect(allToday.map(storedId)).toEqual(expect.arrayContaining([quickId, stressId]));

    const first = await post(a.context.request, origin, '', fullMood);
    expect(first.status(), 'The first full daily check-in must persist').toBe(201);
    expect(first.headers()['cache-control']).toContain('no-store');
    const firstId = storedId((await first.json()) as MoodRecord);

    const twice = await post(a.context.request, origin, '', fullMood);
    expect(twice.status(), 'Second sequential full check-in must return conflict').toBe(409);
    const conflict = (await twice.json()) as { code?: string; message?: string };
    expect(
      conflict.code === 'DAILY_CHECKIN_EXISTS' || conflict.message === 'Daily check-in already exists for this calendar day',
      'The conflict must identify the daily admission rule',
    ).toBe(true);
    expect((await last(a.context.request, 'Europe/Warsaw')).map(storedId)).toEqual([firstId]);

    const foreign = await b.context.request.get(`${API}/${firstId}`, { maxRedirects: 0 });
    expect([403, 404], 'Foreign user must never read the daily record').toContain(foreign.status());

    // Independent second user exercises the actual unique-index concurrency path.
    const [r1, r2] = await Promise.all([
      post(b.context.request, origin, '', fullMood),
      post(b.context.request, origin, '', fullMood),
    ]);
    expect([r1.status(), r2.status()].sort(), 'One accepted and one rejected concurrent write').toEqual([201, 409]);
    const winner = r1.status() === 201 ? r1 : r2;
    const winnerId = storedId((await winner.json()) as MoodRecord);
    expect((await last(b.context.request, 'Europe/Warsaw')).map(storedId)).toEqual([winnerId]);
  } finally {
    await Promise.all([anonymous?.close(), a?.context.close(), b?.context.close()]);
    // No mood-record DELETE API exists. Approved isolated-test DB reset is mandatory after the run,
    // including a failed run. Never use production identities or silently claim cleanup.
  }
});

test('Dzvin PWA: browser IANA zone cookie synchronizes on authenticated My Day', async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const origin = approvedOrigin(baseURL);
  for (const zone of ['Europe/Warsaw', 'Europe/Kyiv'] as const) {
    const context = await browser.newContext({
      baseURL: origin,
      storageState: 'playwright/.auth/b2c-a.json',
      timezoneId: zone,
    });
    try {
      const page = await context.newPage();
      const response = await page.goto('/en/my-day', { waitUntil: 'domcontentloaded' });
      expect(response?.status(), 'My Day must load with authenticated QA state').toBe(200);
      await expect.poll(
        () => page.evaluate(() => new URLSearchParams(document.cookie.replace(/; /g, '&')).get('dzvin_time_zone')),
        { message: 'SSR timezone cookie must agree with the browser IANA zone', timeout: 12_000 },
      ).toBe(zone);
    } finally {
      await context.close();
    }
  }
});
