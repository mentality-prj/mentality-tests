import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext } from '@playwright/test';

const B2C_PAGES = [
  '/en/my-day',
  '/en/mood-tracker',
  '/en/diary',
  '/en/my-progress',
  '/en/my-progress/achievements',
] as const;

const PROD_HOSTS = new Set(['dzvin.co', 'www.dzvin.co', 'mentality-web.vercel.app']);
const ID_PATTERN = /^[0-9a-f]{24}$/i;

type Actor = { context: BrowserContext; userId: string; moodId: string; diaryId: string };

function requireIsolatedPreview(baseURL: string | undefined): string {
  if (!baseURL) throw new Error('E2E_BASE_URL is required for B2C acceptance');
  const url = new URL(baseURL);
  const origin = url.origin;
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    PROD_HOSTS.has(url.hostname) ||
    !process.env.E2E_ALLOWED_MUTATION_ORIGIN ||
    process.env.E2E_ALLOWED_MUTATION_ORIGIN !== origin ||
    process.env.E2E_DISPOSABLE_TENANT_CONFIRMED !== '1'
  ) {
    throw new Error('B2C gate requires an approved isolated, nonproduction preview and tenant');
  }
  return origin;
}

async function makeActor(
  browser: Browser,
  origin: string,
  stateFile: string,
  moodIdName: string,
  diaryIdName: string,
): Promise<Actor> {
  const moodId = process.env[moodIdName];
  const diaryId = process.env[diaryIdName];
  expect(moodId, moodIdName + ' fixture must be configured').toMatch(ID_PATTERN);
  expect(diaryId, diaryIdName + ' fixture must be configured').toMatch(ID_PATTERN);
  const context = await browser.newContext({ baseURL: origin, storageState: stateFile });
  try {
    const response = await context.request.get('/api/auth/session');
    expect(response.status(), 'B2C fixture session must be authenticated').toBe(200);
    const session = (await response.json()) as { id?: string; role?: string };
    expect(session.id, 'B2C user must have a server-verified identity').toBeTruthy();
    expect(session.role, 'B2C account must not be privileged').not.toBe('admin');
    return { context, userId: session.id!, moodId: moodId!, diaryId: diaryId! };
  } catch (error) {
    await context.close();
    throw error;
  }
}

test('B2C personal journey and user isolation use real authenticated backend reads', async ({
  browser,
  baseURL,
}) => {
  const origin = requireIsolatedPreview(baseURL);
  let a: Actor | undefined;
  let b: Actor | undefined;
  let anonymous: BrowserContext | undefined;
  try {
    a = await makeActor(
      browser,
      origin,
      'playwright/.auth/b2c-a.json',
      'E2E_B2C_A_MOOD_ID',
      'E2E_B2C_A_DIARY_ID',
    );
    b = await makeActor(
      browser,
      origin,
      'playwright/.auth/b2c-b.json',
      'E2E_B2C_B_MOOD_ID',
      'E2E_B2C_B_DIARY_ID',
    );
    expect(a.userId, 'Independent B2C users are mandatory').not.toBe(b.userId);
    expect(a.moodId, 'Separate owned mood-record fixtures are mandatory').not.toBe(b.moodId);
    expect(a.diaryId, 'Separate owned diary fixtures are mandatory').not.toBe(b.diaryId);

    // Fail if this preview has not enabled the server-side B2C-only gate.
    for (const blockedPath of ['mood-risk/actionable', 'mood-feed', 'companies']) {
      const blocked = await a.context.request.get('/api/backend/' + blockedPath, {
        maxRedirects: 0,
      });
      expect(blocked.status(), blockedPath + ' must be disabled for B2C').toBe(404);
      expect(blocked.headers()['cache-control']).toContain('no-store');
    }

    const page = await a.context.newPage();
    for (const path of B2C_PAGES) {
      const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), path).toBe(200);
      expect(new URL(page.url()).pathname, path).toBe(path);
    }

    for (const actor of [a, b]) {
      const stats = await actor.context.request.get(
        '/api/backend/user-statistics/mood?timeZone=Europe%2FWarsaw',
      );
      expect(stats.status(), 'Personal progress API must succeed').toBe(200);
      expect(stats.headers()['cache-control']).toContain('no-store');
      const payload = (await stats.json()) as { totalRecords?: number; trend30d?: unknown };
      expect(payload.totalRecords).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(payload.trend30d)).toBe(true);

      const owned = await actor.context.request.get('/api/backend/mood-record/' + actor.moodId);
      expect(owned.status(), 'Actor must be able to read own seeded check-in').toBe(200);
      expect(owned.headers()['cache-control']).toContain('no-store');
      const record = (await owned.json()) as { id?: string; _id?: string };
      expect(record.id ?? record._id).toBe(actor.moodId);

      const diaryList = await actor.context.request.get('/api/backend/diary/user');
      expect(diaryList.status(), 'Personal diary history must be available').toBe(200);
      expect(diaryList.headers()['cache-control']).toContain('no-store');
      const entries = (await diaryList.json()) as Array<{ id?: string; _id?: string }>;
      expect(entries.some((entry) => (entry.id ?? entry._id) === actor.diaryId)).toBe(true);

      const ownDiary = await actor.context.request.get('/api/backend/diary/' + actor.diaryId);
      expect(ownDiary.status(), 'Own private diary fixture must be readable').toBe(200);
      expect(ownDiary.headers()['cache-control']).toContain('no-store');
      const diary = (await ownDiary.json()) as { id?: string; _id?: string };
      expect(diary.id ?? diary._id).toBe(actor.diaryId);
    }

    for (const [actor, foreign] of [
      [a, b],
      [b, a],
    ] as const) {
      const response = await actor.context.request.get(
        '/api/backend/mood-record/' + foreign.moodId,
      );
      expect([403, 404], 'Cross-user mood read must be denied').toContain(response.status());
      expect(response.headers()['cache-control']).toContain('no-store');

      const foreignDiary = await actor.context.request.get('/api/backend/diary/' + foreign.diaryId);
      expect(foreignDiary.status(), 'Foreign private diary must not be disclosed').toBe(404);
      expect(foreignDiary.headers()['cache-control']).toContain('no-store');
    }

    anonymous = await browser.newContext({
      baseURL: origin,
      storageState: { cookies: [], origins: [] },
    });
    for (const path of [
      '/api/backend/user-statistics/mood',
      '/api/backend/mood-record/' + a.moodId,
      '/api/backend/diary/user',
      '/api/backend/diary/' + a.diaryId,
    ]) {
      const result = await anonymous.request.get(path, { maxRedirects: 0 });
      expect(result.status(), path).toBe(401);
      expect(result.headers()['cache-control']).toContain('no-store');
    }
  } finally {
    await Promise.all([a?.context.close(), b?.context.close(), anonymous?.close()]);
  }
});
