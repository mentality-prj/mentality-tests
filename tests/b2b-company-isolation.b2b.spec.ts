import { readFileSync } from 'node:fs';
import { expect, request as playwrightRequest, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

const states = {
  aAdmin: 'playwright/.auth/b2b-a-admin.json',
  bAdmin: 'playwright/.auth/b2b-b-admin.json',
  aManager: 'playwright/.auth/b2b-a-manager.json',
  aEmployee: 'playwright/.auth/b2b-a-employee.json',
  multi: 'playwright/.auth/b2b-multi.json',
  noCompany: 'playwright/.auth/b2b-no-company.json',
  platform: 'playwright/.auth/zitadel-admin.json',
} as const;

type Actor = keyof typeof states;

function fixture(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(name + ' is required for B2B E2E');
  return value;
}

function companyUrl(companyId: string, suffix = ''): string {
  return '/api/backend/companies/' + companyId + suffix;
}

async function asActor<T>(
  baseURL: string,
  actor: Actor,
  run: (api: APIRequestContext) => Promise<T>,
): Promise<T> {
  const api = await playwrightRequest.newContext({ baseURL, storageState: states[actor] });
  try {
    return await run(api);
  } finally {
    await api.dispose();
  }
}

async function forbiddenRead(api: APIRequestContext, path: string): Promise<void> {
  const response = await api.get(path, { maxRedirects: 0 });
  expect([403, 404], path).toContain(response.status());
  expect(response.headers()['cache-control'], path).toContain('no-store');
}

function idOf(record: { id?: string; _id?: string }): string | undefined {
  return record.id ?? record._id;
}

test.describe('Gate 2 / real B2B company isolation', () => {
  test('distinct company owners cannot read the other company or its resources', async ({
    baseURL,
  }) => {
    const companyA = fixture('E2E_B2B_COMPANY_A_ID');
    const companyB = fixture('E2E_B2B_COMPANY_B_ID');
    for (const [actor, own, foreign] of [
      ['aAdmin', companyA, companyB],
      ['bAdmin', companyB, companyA],
    ] as const) {
      await asActor(baseURL!, actor, async (api) => {
        expect((await api.get(companyUrl(own))).status()).toBe(200);
        for (const suffix of [
          '',
          '/groups',
          '/employees',
          '/invites',
          '/access-scopes',
          '/salary-grades',
          '/analytics/mood',
        ]) {
          await forbiddenRead(api, companyUrl(foreign, suffix));
        }
      });
    }
  });

  test('global platform admin without membership has no implicit B2B access', async ({
    baseURL,
  }) => {
    await asActor(baseURL!, 'platform', async (api) => {
      const session = await api.get('/api/auth/session');
      expect(session.status()).toBe(200);
      expect((await session.json()).role).toBe('admin');
      for (const suffix of ['', '/groups', '/access-scopes', '/salary-grades']) {
        await forbiddenRead(api, companyUrl(fixture('E2E_B2B_COMPANY_A_ID'), suffix));
      }
      const selector = await api.post('/api/company-context', {
        headers: { origin: new URL(baseURL!).origin },
        form: { companyId: fixture('E2E_B2B_COMPANY_A_ID'), locale: 'en' },
        maxRedirects: 0,
      });
      expect(selector.status()).toBe(403);
    });
  });

  test('manager sees only granted subtree; employee cannot read analytics', async ({
    baseURL,
  }) => {
    const companyA = fixture('E2E_B2B_COMPANY_A_ID');
    const allowed = fixture('E2E_B2B_GROUP_A_ID');
    const outside = fixture('E2E_B2B_GROUP_A_OUTSIDE_SCOPE_ID');
    await asActor(baseURL!, 'aManager', async (api) => {
      const groups = await api.get(companyUrl(companyA, '/groups'));
      expect(groups.status()).toBe(200);
      const ids = (await groups.json() as Array<{ id?: string; _id?: string }>).map(idOf);
      expect(ids).toContain(allowed);
      expect(ids).not.toContain(outside);
      const analytics = await api.get(companyUrl(companyA, '/analytics/mood'));
      expect(analytics.status()).toBe(200);
      await forbiddenRead(api, companyUrl(companyA, '/access-scopes'));
      await forbiddenRead(api, companyUrl(companyA, '/salary-grades'));
      await forbiddenRead(api, companyUrl(fixture('E2E_B2B_COMPANY_B_ID'), '/groups'));
    });
    await asActor(baseURL!, 'aEmployee', async (api) => {
      await forbiddenRead(api, companyUrl(companyA, '/analytics/mood'));
      await forbiddenRead(api, companyUrl(companyA, '/access-scopes'));
    });
  });

  test('denied invitations cannot elevate manager or cross group/company boundaries', async ({
    baseURL,
  }) => {
    const a = fixture('E2E_B2B_COMPANY_A_ID');
    const bGroup = fixture('E2E_B2B_GROUP_B_ID');
    const aGroup = fixture('E2E_B2B_GROUP_A_ID');
    const origin = new URL(baseURL!).origin;
    await asActor(baseURL!, 'aManager', async (api) => {
      const escalation = await api.post(companyUrl(a, '/invites'), {
        headers: { origin },
        data: {
          inviteeEmail: 'must-not-create-manager@invalid.example',
          groupId: aGroup,
          role: 'manager',
        },
      });
      expect([403, 404]).toContain(escalation.status());
    });
    await asActor(baseURL!, 'aAdmin', async (api) => {
      const foreignGroup = await api.post(companyUrl(a, '/invites'), {
        headers: { origin },
        data: {
          inviteeEmail: 'must-not-create-cross-tenant@invalid.example',
          groupId: bGroup,
          role: 'employee',
        },
      });
      expect([403, 404]).toContain(foreignGroup.status());
    });
  });

  test('manager invitation list is isolated by requested company', async ({ baseURL }) => {
    const a = fixture('E2E_B2B_COMPANY_A_ID');
    const b = fixture('E2E_B2B_COMPANY_B_ID');
    const inviteA = fixture('E2E_B2B_MULTI_INVITE_A_ID');
    const inviteB = fixture('E2E_B2B_MULTI_INVITE_B_ID');
    await asActor(baseURL!, 'multi', async (api) => {
      const first = await api.get(companyUrl(a, '/invites'));
      const second = await api.get(companyUrl(b, '/invites'));
      expect(first.status()).toBe(200);
      expect(second.status()).toBe(200);
      const firstInvites = await first.json() as Array<{ id: string; companyId: string }>;
      const secondInvites = await second.json() as Array<{ id: string; companyId: string }>;
      expect(firstInvites.map((item) => item.id)).toContain(inviteA);
      expect(secondInvites.map((item) => item.id)).toContain(inviteB);
      expect(firstInvites.every((item) => item.companyId === a)).toBe(true);
      expect(secondInvites.every((item) => item.companyId === b)).toBe(true);
      expect(firstInvites.map((item) => item.id)).not.toContain(inviteB);
      expect(secondInvites.map((item) => item.id)).not.toContain(inviteA);
    });
  });

  test('multi-company selector validates each switch server-side', async ({ baseURL }) => {
    const companyA = fixture('E2E_B2B_COMPANY_A_ID');
    const companyB = fixture('E2E_B2B_COMPANY_B_ID');
    await asActor(baseURL!, 'multi', async (api) => {
      const mine = await api.get('/api/backend/companies/mine');
      expect(mine.status()).toBe(200);
      const companyIds = (await mine.json() as Array<{ id: string }>).map((item) => item.id);
      expect(companyIds).toContain(companyA);
      expect(companyIds).toContain(companyB);
      for (const companyId of [companyA, companyB]) {
        const change = await api.post('/api/company-context', {
          headers: { origin: new URL(baseURL!).origin },
          form: { companyId, locale: 'en' },
          maxRedirects: 0,
        });
        expect(change.status()).toBe(303);
        expect(change.headers()['set-cookie']).toMatch(/dzvin-active-company=.*HttpOnly/i);
        const session = await api.get('/api/auth/session');
        expect(session.status()).toBe(200);
        const user = await session.json();
        expect(user.companyId).toBe(companyId);
        expect(['superuser', 'manager', 'employee']).toContain(user.companyRole);
      }
      const invalid = await api.post('/api/company-context', {
        headers: { origin: new URL(baseURL!).origin },
        form: { companyId: 'not-an-object-id', locale: 'en' },
        maxRedirects: 0,
      });
      expect(invalid.status()).toBe(400);
      expect(invalid.headers()['set-cookie']).toBeUndefined();
      const csrf = await api.post('/api/company-context', {
        headers: { origin: 'https://attacker.invalid' },
        form: { companyId: companyA, locale: 'en' },
        maxRedirects: 0,
      });
      expect(csrf.status()).toBe(403);
      expect(csrf.headers()['set-cookie']).toBeUndefined();
    });
  });

  test('zero-membership identity never receives company authority', async ({ baseURL }) => {
    await asActor(baseURL!, 'noCompany', async (api) => {
      const mine = await api.get('/api/backend/companies/mine');
      expect(mine.status()).toBe(200);
      expect(await mine.json()).toEqual([]);
      const denied = await api.post('/api/company-context', {
        headers: { origin: new URL(baseURL!).origin },
        form: { companyId: fixture('E2E_B2B_COMPANY_A_ID'), locale: 'en' },
        maxRedirects: 0,
      });
      expect(denied.status()).toBe(403);
      await forbiddenRead(api, companyUrl(fixture('E2E_B2B_COMPANY_A_ID')));
    });
  });

  test('stale company selection cannot grant access to a former or foreign tenant', async ({
    baseURL,
  }) => {
    const existing = JSON.parse(readFileSync(states.aAdmin, 'utf8'));
    const host = new URL(baseURL!).hostname;
    const authCookie = existing.cookies.find((item: { name: string }) => item.name === 'auth-tokens');
    expect(authCookie).toBeDefined();
    existing.cookies = existing.cookies.filter(
      (item: { name: string }) => item.name !== 'dzvin-active-company',
    );
    existing.cookies.push({
      ...authCookie,
      name: 'dzvin-active-company',
      value: fixture('E2E_B2B_COMPANY_B_ID'),
      domain: host,
      path: '/',
    });
    const api = await playwrightRequest.newContext({ baseURL, storageState: existing });
    try {
      const session = await api.get('/api/auth/session');
      expect(session.status()).toBe(200);
      const user = await session.json();
      expect(user.companyId).not.toBe(fixture('E2E_B2B_COMPANY_B_ID'));
      await forbiddenRead(api, companyUrl(fixture('E2E_B2B_COMPANY_B_ID'), '/groups'));
      const mine = await api.get('/api/backend/companies/mine');
      expect(mine.status()).toBe(200);
      expect((await mine.json() as Array<{ id: string }>).map((item) => item.id)).toContain(
        fixture('E2E_B2B_COMPANY_A_ID'),
      );
    } finally {
      await api.dispose();
    }
  });
});
