import { expect, test } from '@playwright/test';

test('authenticated same-origin mood write persists under a disposable tenant', async ({
  request,
}) => {
  const origin = new URL(process.env.E2E_BASE_URL!).origin;
  const allowlistedOrigin = process.env.E2E_ALLOWED_MUTATION_ORIGIN;
  const confirmed = process.env.E2E_DISPOSABLE_TENANT_CONFIRMED;
  if (!allowlistedOrigin || origin !== allowlistedOrigin || confirmed !== '1') {
    throw new Error(
      'Mood mutation refused: target origin must match E2E_ALLOWED_MUTATION_ORIGIN and disposable tenant must be confirmed',
    );
  }
  if (['dzvin.co', 'www.dzvin.co', 'mentality-web.vercel.app'].includes(new URL(origin).hostname)) {
    throw new Error('Mood mutation refused: production host is not a disposable test tenant');
  }

  const tag = 'e2e-isolated-' + Date.now();
  const posted = await request.post('/api/backend/mood-record?withAiExplanation=false', {
    headers: { origin },
    data: {
      moodLevel: 3,
      stressLevel: 2,
      energyLevel: 3,
      focusLevel: 3,
      tags: [tag],
    },
  });

  expect(posted.status()).toBe(201);
  expect(posted.headers()['cache-control']).toContain('no-store');
  const record = await posted.json();
  const id = record.id ?? record._id;
  expect(id).toMatch(/^[a-f0-9]{24}$/i);

  const fetched = await request.get('/api/backend/mood-record/' + id);
  expect(fetched.status()).toBe(200);
  const stored = await fetched.json();
  expect(stored.moodLevel).toBe(3);
  expect(stored.tags).toContain(tag);

  // No DELETE exists in the mood-record controller. The dedicated tenant must
  // be reset using an approved test-environment teardown after this workflow.
});
