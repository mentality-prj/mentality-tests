import { randomUUID } from 'node:crypto';

import { expect, request, test } from '@playwright/test';
import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  Download,
  Locator,
  Page,
} from '@playwright/test';

type Actor = { context: BrowserContext; userId: string };
type Created = { actor: Actor; id: string };
type DiaryEntry = { id: string; content: string; isActive: boolean };

async function respondToConfirm(page: Page, button: Locator, accept: boolean): Promise<void> {
  // Register the one dialog waiter BEFORE initiating the click; do not leave
  // un-awaited async event handlers behind (they can double-handle a dialog).
  const dialogEvent = page.waitForEvent('dialog');
  const click = button.click();
  const dialog = await dialogEvent;
  expect(dialog.type(), 'Delete UI must use an actual browser confirm dialog').toBe('confirm');
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await click;
}
const ID = /^[a-f0-9]{24}$/i;

function requireNonproductionOrigin(baseURL: string | undefined): string {
  if (!baseURL) throw new Error('E2E_BASE_URL is required');
  const url = new URL(baseURL);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    url.port ||
    host === 'dzvin.co' ||
    host.endsWith('.dzvin.co') ||
    host === 'mentality-web.vercel.app' ||
    host.includes('-git-production-') ||
    process.env.E2E_ALLOWED_MUTATION_ORIGIN !== url.origin ||
    (process.env.E2E_DISPOSABLE_TENANT_CONFIRMED !== '1' &&
      process.env.E2E_QA_SHARED_BACKEND_SCOPED_APPROVED !== '1')
  ) {
    throw new Error(
      'Diary E2E requires allowlisted nonproduction preview and explicit fixture authorization',
    );
  }
  if (process.env.E2E_QA_SHARED_BACKEND_SCOPED_APPROVED === '1') {
    const a = process.env.E2E_QA_A_USER_ID;
    const b = process.env.E2E_QA_B_USER_ID;
    if (!a?.trim() || !b?.trim() || a === b) {
      throw new Error('Existing-backend mutation requires two distinct pinned QA user IDs');
    }
  }
  return url.origin;
}

async function openActor(
  browser: Browser,
  origin: string,
  state: string,
  expectedUserId?: string,
): Promise<Actor> {
  const context = await browser.newContext({
    baseURL: origin,
    storageState: state,
    acceptDownloads: true,
  });
  try {
    const sessionResponse = await context.request.get('/api/auth/session');
    expect(sessionResponse.status(), 'Zitadel session must be valid in the deployed preview').toBe(
      200,
    );
    const session = (await sessionResponse.json()) as { id?: string; role?: string };
    expect(session.id, 'A server-verified user ID is required').toBeTruthy();
    expect(session.role).not.toBe('admin');
    if (expectedUserId) {
      expect(session.id, 'Session does not belong to the explicitly approved QA identity').toBe(
        expectedUserId,
      );
    }
    return { context, userId: session.id! };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function createEntry(actor: Actor, origin: string, content: string): Promise<string> {
  const result = await actor.context.request.post('/api/backend/diary', {
    headers: { Origin: origin },
    data: { content, tags: [], isActive: false },
  });
  expect(result.status(), 'The approved QA account must support owned diary writes').toBe(201);
  expect(result.headers()['cache-control']).toContain('no-store');
  const entry = (await result.json()) as { id?: string };
  expect(entry.id).toMatch(ID);
  // Before authorizing teardown by returned ID, prove it really is our marker.
  // If the response is inconsistent, the finally block recovers by exact marker.
  const read = await actor.context.request.get('/api/backend/diary/' + entry.id);
  expect(read.status()).toBe(200);
  const stored = (await read.json()) as { id?: string; content?: string };
  expect(stored.id).toBe(entry.id);
  expect(stored.content).toBe(content);
  return entry.id!;
}

async function assertOwned(actor: Actor, id: string): Promise<void> {
  const response = await actor.context.request.get('/api/backend/diary/' + id);
  expect(response.status(), 'Owner must retain access to the record').toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  const entry = (await response.json()) as { id?: string };
  expect(entry.id).toBe(id);
}

async function readExport(
  download: Download,
): Promise<{ format: string; version: number; entries: DiaryEntry[] }> {
  expect(download.suggestedFilename()).toMatch(/^dzvin-diary-\d{4}-\d{2}-\d{2}\.json$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const content = Buffer.concat(chunks).toString('utf8');
  const payload = JSON.parse(content) as { format: string; version: number; entries: DiaryEntry[] };
  expect(payload.format).toBe('dzvin-diary');
  expect(payload.version).toBe(1);
  expect(Array.isArray(payload.entries)).toBe(true);
  // Never print journal content, downloaded files, cookies, or storageState in test reports.
  return payload;
}

test('B2C diary: real two-user ownership, CSRF, export, UI delete and guaranteed teardown', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const origin = requireNonproductionOrigin(baseURL);
  const sharedQa = process.env.E2E_QA_SHARED_BACKEND_SCOPED_APPROVED === '1';
  let a: Actor | undefined;
  let b: Actor | undefined;
  let anonymous: BrowserContext | undefined;
  const created: Created[] = [];
  const cleanupErrors: string[] = [];
  const marker = 'e2e-diary-' + randomUUID();
  try {
    a = await openActor(
      browser,
      origin,
      'playwright/.auth/b2c-a.json',
      sharedQa ? process.env.E2E_QA_A_USER_ID : undefined,
    );
    b = await openActor(
      browser,
      origin,
      'playwright/.auth/b2c-b.json',
      sharedQa ? process.env.E2E_QA_B_USER_ID : undefined,
    );
    expect(a.userId, 'Two distinct verified accounts are required').not.toBe(b.userId);

    // Create ONLY new disposable fixtures; never delete a pre-existing user record.
    const aActive = await createEntry(a, origin, marker + '-a-active');
    created.push({ actor: a, id: aActive });
    const aArchived = await createEntry(a, origin, marker + '-a-archived');
    created.push({ actor: a, id: aArchived });
    const bOnly = await createEntry(b, origin, marker + '-b-private');
    created.push({ actor: b, id: bOnly });

    const archive = await a.context.request.patch('/api/backend/diary/' + aArchived + '/activate', {
      headers: { Origin: origin },
    });
    expect(archive.status(), 'A fixture must be archived to qualify full export').toBe(200);

    await assertOwned(a, aActive);
    await assertOwned(a, aArchived);
    await assertOwned(b, bOnly);

    // Both directions: the same 404 response must hide another user's existence.
    for (const [actor, foreign] of [
      [a, bOnly],
      [b, aActive],
    ] as const) {
      const read = await actor.context.request.get('/api/backend/diary/' + foreign);
      expect(read.status(), 'Cross-user diary GET must be denied').toBe(404);
      const deleteAttempt = await actor.context.request.delete('/api/backend/diary/' + foreign, {
        headers: { Origin: origin },
      });
      expect(deleteAttempt.status(), 'Cross-user diary DELETE must be denied').toBe(404);
      expect(deleteAttempt.headers()['cache-control']).toContain('no-store');
    }
    await assertOwned(a, aActive);
    await assertOwned(b, bOnly);

    for (const [actor, foreignMarker] of [
      [a, marker + '-b-private'],
      [b, marker + '-a-active'],
    ] as const) {
      const list = await actor.context.request.get('/api/backend/diary/user');
      expect(list.status()).toBe(200);
      const entries = (await list.json()) as Array<{ content?: string }>;
      expect(
        entries.some((entry) => entry.content === foreignMarker),
        'Cross-user list leakage',
      ).toBe(false);
    }

    const crossSite = await a.context.request.delete('/api/backend/diary/' + aActive, {
      headers: { Origin: 'https://invalid-attacker.example' },
    });
    expect(crossSite.status(), 'Cross-origin DELETE must be rejected before mutation').toBe(403);
    await assertOwned(a, aActive);

    anonymous = await browser.newContext({
      baseURL: origin,
      storageState: { cookies: [], origins: [] },
    });
    const anonymousDelete = await anonymous.request.delete('/api/backend/diary/' + aActive, {
      headers: { Origin: origin },
    });
    expect(anonymousDelete.status(), 'Anonymous delete must not reach the backend').toBe(401);
    await assertOwned(a, aActive);

    // Browser download: archived notes are included, while another account's private marker is excluded.
    const pageA = await a.context.newPage();
    const responseA = await pageA.goto('/en/diary', { waitUntil: 'domcontentloaded' });
    expect(responseA?.status()).toBe(200);
    const exportA = pageA.getByRole('button', { name: 'Export all diary entries (JSON)' });
    await expect(exportA).toBeEnabled();
    const [downloadA] = await Promise.all([pageA.waitForEvent('download'), exportA.click()]);
    const aData = await readExport(downloadA);
    expect(
      aData.entries.some((entry) => entry.id === aActive && entry.content === marker + '-a-active'),
    ).toBe(true);
    expect(
      aData.entries.some(
        (entry) =>
          entry.id === aArchived &&
          entry.content === marker + '-a-archived' &&
          entry.isActive === true,
      ),
    ).toBe(true);
    expect(aData.entries.some((entry) => entry.content === marker + '-b-private')).toBe(false);

    const pageB = await b.context.newPage();
    const responseB = await pageB.goto('/en/diary', { waitUntil: 'domcontentloaded' });
    expect(responseB?.status()).toBe(200);
    const [downloadB] = await Promise.all([
      pageB.waitForEvent('download'),
      pageB.getByRole('button', { name: 'Export all diary entries (JSON)' }).click(),
    ]);
    const bData = await readExport(downloadB);
    expect(
      bData.entries.some((entry) => entry.id === bOnly && entry.content === marker + '-b-private'),
    ).toBe(true);
    expect(bData.entries.some((entry) => entry.content === marker + '-a-active')).toBe(false);
    expect(bData.entries.some((entry) => entry.content === marker + '-a-archived')).toBe(false);

    // P0 help and privacy must remain accessible across every supported locale.
    const localizedHelp = [
      {
        locale: 'en',
        summary: 'Need urgent help?',
        privacy: 'How your data is handled',
        call: 'Call 112',
      },
      {
        locale: 'uk',
        summary: 'Потрібна термінова допомога?',
        privacy: 'Як обробляються дані',
        call: 'Зателефонувати 112',
      },
      {
        locale: 'pl',
        summary: 'Potrzebujesz pilnej pomocy?',
        privacy: 'Jak przetwarzane są dane',
        call: 'Zadzwoń pod 112',
      },
    ] as const;
    for (const { locale, summary, privacy, call } of localizedHelp) {
      const diary = await pageA.goto('/' + locale + '/diary', { waitUntil: 'domcontentloaded' });
      expect(diary?.status()).toBe(200);
      await expect(pageA.getByRole('link', { name: privacy })).toHaveAttribute(
        'href',
        new RegExp('/' + locale + '/privacy'),
      );
      const emergency = pageA.getByText(summary, { exact: true });
      await expect(emergency).toBeVisible();
      await emergency.click();
      await expect(pageA.getByRole('link', { name: call })).toHaveAttribute('href', 'tel:112');

      const myDay = await pageA.goto('/' + locale + '/my-day', { waitUntil: 'domcontentloaded' });
      expect(myDay?.status()).toBe(200);
      await expect(pageA.getByText(summary, { exact: true })).toBeVisible();
    }

    await pageA.goto('/en/diary', { waitUntil: 'domcontentloaded' });
    const card = pageA.getByText(marker + '-a-active', { exact: true }).locator('..');
    await respondToConfirm(pageA, card.getByRole('button', { name: 'Delete entry' }), false);
    await assertOwned(a, aActive);

    await respondToConfirm(pageA, card.getByRole('button', { name: 'Delete entry' }), true);
    await expect
      .poll(async () => (await a!.context.request.get('/api/backend/diary/' + aActive)).status(), {
        message: 'UI-confirmed deletion must remove the owned entry',
      })
      .toBe(404);
    await assertOwned(a, aArchived);
    await assertOwned(b, bOnly);

    // Verify direct DELETE contract, including repeated delete not disclosing existence.
    const deleteArchived = await a.context.request.delete('/api/backend/diary/' + aArchived, {
      headers: { Origin: origin },
    });
    expect(deleteArchived.status()).toBe(204);
    const duplicateDelete = await a.context.request.delete('/api/backend/diary/' + aArchived, {
      headers: { Origin: origin },
    });
    expect(duplicateDelete.status()).toBe(404);
  } finally {
    // Keep cleanup API sessions separate from the browser contexts. Browser
    // dialog exceptions can tear down page contexts before finally executes.
    // Restrict deletion to verified QA subjects and exact run-owned fixtures.
    const cleanup = new Map<string, { api: APIRequestContext; id: string }>();
    const isolatedApis: APIRequestContext[] = [];
    const verifiedApis = new Map<Actor, APIRequestContext>();
    const actors = [
      {
        actor: a,
        state: 'playwright/.auth/b2c-a.json',
        contents: new Set([marker + '-a-active', marker + '-a-archived']),
      },
      {
        actor: b,
        state: 'playwright/.auth/b2c-b.json',
        contents: new Set([marker + '-b-private']),
      },
    ];
    try {
      for (const { actor, state, contents } of actors) {
        if (!actor) continue;
        try {
          const api = await request.newContext({ baseURL: origin, storageState: state });
          isolatedApis.push(api);
          const session = await api.get('/api/auth/session');
          if (session.status() !== 200) {
            cleanupErrors.push('Detached cleanup session is not authenticated');
            continue;
          }
          const identity = (await session.json()) as { id?: string };
          if (identity.id !== actor.userId) {
            cleanupErrors.push('Detached cleanup subject differs from the approved QA identity');
            continue;
          }
          verifiedApis.set(actor, api);
          try {
            const list = await api.get('/api/backend/diary/user');
            if (list.status() !== 200) {
              cleanupErrors.push('Cannot enumerate QA fixture IDs for teardown');
              continue;
            }
            const entries = (await list.json()) as Array<{ id?: string; content?: string }>;
            const ids = new Set(
              created.filter((entry) => entry.actor === actor).map((entry) => entry.id),
            );
            for (const entry of entries) {
              if (!contents.has(entry.content ?? '')) continue;
              if (!entry.id || !ID.test(entry.id)) {
                cleanupErrors.push('Exact run-marked QA fixture has invalid ID');
                continue;
              }
              ids.add(entry.id);
            }
            for (const id of ids) {
              cleanup.set(id, { api, id });
            }
          } catch {
            cleanupErrors.push('Could not recover exact run-marked QA fixtures');
          }
        } catch {
          cleanupErrors.push('Cannot create detached QA teardown context');
        }
      }
      for (const { api, id } of cleanup.values()) {
        try {
          const deletion = await api.delete('/api/backend/diary/' + id, {
            headers: { Origin: origin },
          });
          if (![204, 404].includes(deletion.status())) {
            cleanupErrors.push('Exact fixture deletion was not confirmed');
          }
          const check = await api.get('/api/backend/diary/' + id);
          if (check.status() !== 404) cleanupErrors.push('Exact fixture remains visible');
        } catch {
          cleanupErrors.push('Detached fixture cleanup failed');
        }
      }
      for (const { actor, contents } of actors) {
        if (!actor) continue;
        const scoped = verifiedApis.get(actor);
        if (!scoped) {
          cleanupErrors.push('Final QA fixture check lacks a verified API session');
          continue;
        }
        try {
          const list = await scoped.get('/api/backend/diary/user');
          if (list.status() !== 200) {
            cleanupErrors.push('Cannot verify final QA fixture list');
            continue;
          }
          const entries = (await list.json()) as Array<{ content?: string }>;
          if (entries.some((entry) => contents.has(entry.content ?? ''))) {
            cleanupErrors.push('Exact UUID-marked QA fixture remains after teardown');
          }
        } catch {
          cleanupErrors.push('Final QA fixture verification failed');
        }
      }
    } finally {
      await Promise.all(isolatedApis.map((api) => api.dispose().catch(() => undefined)));
      await Promise.all([a?.context.close(), b?.context.close(), anonymous?.close()]);
    }
    expect(cleanupErrors, "Only this run's QA diary fixtures must remain absent").toEqual([]);
  }
});
