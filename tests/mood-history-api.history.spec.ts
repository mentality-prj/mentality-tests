import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

const ENDPOINT = '/api/backend/mood-record';
const FIXTURE_LIMIT = 100;
const PAGE_LIMIT = 2;

type Metric = 'moodLevel' | 'stressLevel' | 'energyLevel' | 'focusLevel';

type MoodRecord = {
  id?: string;
  _id?: string;
  moodLevel: number;
  stressLevel: number;
  energyLevel: number;
  focusLevel: number;
  tags?: string[];
  createdAt: string;
};

type History = { records: MoodRecord[]; total: number };

function fixtureTag(): string {
  const origin = new URL(process.env.E2E_BASE_URL!).origin;
  const allowed = process.env.E2E_ALLOWED_MUTATION_ORIGIN;
  if (process.env.E2E_DISPOSABLE_TENANT_CONFIRMED !== '1' || origin !== allowed) {
    throw new Error('Mood History E2E requires the allowlisted disposable test origin');
  }
  if (['dzvin.co', 'www.dzvin.co', 'mentality-web.vercel.app'].includes(new URL(origin).hostname)) {
    throw new Error('Mood History E2E must never inspect production user records');
  }
  const tag = process.env.E2E_MOOD_HISTORY_FIXTURE_TAG;
  if (!tag || !/^e2e-[a-z0-9_-]{3,60}$/i.test(tag)) {
    throw new Error('E2E_MOOD_HISTORY_FIXTURE_TAG must identify pre-seeded disposable fixtures');
  }
  return tag;
}

function id(record: MoodRecord): string {
  const result = record.id ?? record._id;
  expect(result, 'Backend must serialize each record ID').toMatch(/^[a-f0-9]{24}$/i);
  return result!;
}

function weekday(record: MoodRecord): number {
  const utc = new Date(record.createdAt).getUTCDay();
  return utc === 0 ? 7 : utc;
}

async function history(
  request: APIRequestContext,
  filters: Record<string, string | number | Array<string | number>> = {},
): Promise<History> {
  const params = new URLSearchParams();
  params.append('tags', fixtureTag());
  for (const [key, values] of Object.entries(filters)) {
    for (const value of Array.isArray(values) ? values : [values]) {
      params.append(key, String(value));
    }
  }
  const response = await request.get(`${ENDPOINT}?${params.toString()}`, {
    maxRedirects: 0,
  });
  expect(response.status(), 'Authenticated Mood History must reach the NestJS backend').toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['set-cookie']).toBeUndefined();

  const totalHeader = response.headers()['x-total-count'];
  expect(totalHeader, 'Backend must return a real X-Total-Count header').toMatch(/^(0|[1-9]\d*)$/);
  const total = Number(totalHeader);
  const records = (await response.json()) as MoodRecord[];
  expect(Array.isArray(records)).toBe(true);
  expect(records.length).toBeLessThanOrEqual(total);

  for (const record of records) {
    id(record);
    for (const key of ['moodLevel', 'stressLevel', 'energyLevel', 'focusLevel'] as const) {
      expect(Number.isInteger(record[key]), key).toBe(true);
      expect(record[key], key).toBeGreaterThanOrEqual(1);
      expect(record[key], key).toBeLessThanOrEqual(5);
    }
    expect(Number.isFinite(Date.parse(record.createdAt))).toBe(true);
    expect(record.tags).toContain(fixtureTag());
  }
  return { records, total };
}

async function baseline(request: APIRequestContext): Promise<MoodRecord[]> {
  const result = await history(request, { page: 1, limit: FIXTURE_LIMIT });
  expect(result.total, 'Seed at least six disposable tagged mood records before E2E').toBeGreaterThanOrEqual(6);
  expect(result.total, 'Fixture exceeds E2E limit; use a dedicated smaller fixture tag').toBeLessThanOrEqual(
    FIXTURE_LIMIT,
  );
  expect(result.records).toHaveLength(result.total);
  expect(new Set(result.records.map(id)).size).toBe(result.total);
  return result.records;
}

function expectSameRecords(actual: MoodRecord[], expected: MoodRecord[]): void {
  expect(actual.map(id).sort()).toEqual(expected.map(id).sort());
}

function selectedValues(records: MoodRecord[], metric: Metric): number[] {
  const levels = new Set(records.map((item) => item[metric]));
  for (const value of [1, 3, 5]) {
    expect(levels.has(value), `Seed ${metric} with values 1, 3 and 5 to verify non-contiguous OR`).toBe(
      true,
    );
  }
  return [1, 5];
}

test.describe('Mood History: real NestJS read-only acceptance', () => {
  test('rejects anonymous backend reads even with valid filters', async ({ playwright }) => {
    const context = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      const response = await context.get(`${ENDPOINT}?moodLevels=1&moodLevels=5`, {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(401);
      expect(response.headers()['cache-control']).toContain('no-store');
    } finally {
      await context.dispose();
    }
  });

  test('returns real, user-scoped fixture records with valid totals', async ({ request }) => {
    const records = await baseline(request);
    const days = new Set(records.map(weekday));
    expect([...days].some((day) => day <= 5), 'Fixture needs a UTC weekday').toBe(true);
    expect([...days].some((day) => day >= 6), 'Fixture needs a UTC weekend').toBe(true);
    expect(new Set(records.map((record) => record.createdAt)).size).toBe(records.length);
    for (const metric of ['moodLevel', 'stressLevel', 'energyLevel', 'focusLevel'] as const) {
      selectedValues(records, metric);
    }
  });

  test('applies OR only within each non-contiguous level selection', async ({ request }) => {
    const records = await baseline(request);
    for (const [metric, parameter] of [
      ['moodLevel', 'moodLevels'],
      ['stressLevel', 'stressLevels'],
      ['energyLevel', 'energyLevels'],
      ['focusLevel', 'focusLevels'],
    ] as const) {
      const wanted = selectedValues(records, metric);
      const filtered = await history(request, { [parameter]: wanted, limit: FIXTURE_LIMIT });
      const expected = records.filter((record) => wanted.includes(record[metric]));
      expect(expected.length, `${metric} selection must be non-vacuous`).toBeGreaterThan(0);
      expect(expected.length, `${metric} OR must exclude mid-range fixture records`).toBeLessThan(
        records.length,
      );
      expect(filtered.total).toBe(expected.length);
      expectSameRecords(filtered.records, expected);
    }
  });

  test('intersects multiple metrics, tags and ISO weekdays with AND', async ({ request }) => {
    const records = await baseline(request);
    const anchor = records[0];
    const selected = (metric: Metric): number[] => {
      const alternate = records.find((record) => record[metric] !== anchor[metric]);
      expect(alternate, `Fixture must vary ${metric}`).toBeDefined();
      return [anchor[metric], alternate![metric]];
    };
    const moods = selected('moodLevel');
    const stresses = selected('stressLevel');
    const energies = selected('energyLevel');
    const focuses = selected('focusLevel');
    const day = weekday(anchor);

    const filtered = await history(request, {
      moodLevels: moods,
      stressLevels: stresses,
      energyLevels: energies,
      focusLevels: focuses,
      weekdays: [day],
      limit: FIXTURE_LIMIT,
    });
    const expected = records.filter(
      (record) =>
        moods.includes(record.moodLevel) &&
        stresses.includes(record.stressLevel) &&
        energies.includes(record.energyLevel) &&
        focuses.includes(record.focusLevel) &&
        weekday(record) === day,
    );
    expect(expected.map(id)).toContain(id(anchor));
    expect(filtered.total).toBe(expected.length);
    expectSameRecords(filtered.records, expected);
  });

  test('interprets repeated ISO weekdays and tag OR without broadening results', async ({ request }) => {
    const records = await baseline(request);
    const targetDay = weekday(records[0]);
    const matched = await history(request, {
      weekdays: [targetDay],
      tags: ['e2e-nonexistent-tag-' + Date.now()],
      limit: FIXTURE_LIMIT,
    });
    // The fixture tag is already included by history(); the second tag is an OR alternative.
    const expected = records.filter((record) => weekday(record) === targetDay);
    expect(expected.length).toBeGreaterThan(0);
    expect(matched.total).toBe(expected.length);
    expectSameRecords(matched.records, expected);

    const absent = await history(request, {
      moodLevels: [2, 4],
      weekdays: [targetDay],
      limit: FIXTURE_LIMIT,
    });
    const absentExpected = records.filter(
      (record) => [2, 4].includes(record.moodLevel) && weekday(record) === targetDay,
    );
    expect(absent.total).toBe(absentExpected.length);
    expectSameRecords(absent.records, absentExpected);
  });

  test('sorts before pagination and preserves total count across pages', async ({ request }) => {
    const records = await baseline(request);
    const newest = [...records].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
    const oldest = [...newest].reverse();

    for (const [order, expected] of [
      ['newest', newest],
      ['oldest', oldest],
    ] as const) {
      const first = await history(request, { page: 1, limit: PAGE_LIMIT, order });
      const second = await history(request, { page: 2, limit: PAGE_LIMIT, order });
      expect(first.total).toBe(records.length);
      expect(second.total).toBe(records.length);
      expect(first.records.map(id)).toEqual(expected.slice(0, PAGE_LIMIT).map(id));
      expect(second.records.map(id)).toEqual(
        expected.slice(PAGE_LIMIT, PAGE_LIMIT * 2).map(id),
      );
    }
  });

  test('rejects invalid filter values instead of silently ignoring them', async ({ request }) => {
    const invalid = [
      'moodLevels=0',
      'moodLevels=6',
      'moodLevels=1&moodLevels=1',
      'stressLevels=abc',
      'energyLevels=0',
      'focusLevels=6',
      'weekdays=8',
      'weekdays=0',
      'page=0',
      'limit=0',
      'order=sideways',
    ];
    for (const query of invalid) {
      const result = await request.get(`${ENDPOINT}?tags=${encodeURIComponent(fixtureTag())}&${query}`, {
        maxRedirects: 0,
      });
      expect(result.status(), `Invalid query must be rejected: ${query}`).toBe(400);
      expect(result.headers()['cache-control']).toContain('no-store');
    }
  });
});
