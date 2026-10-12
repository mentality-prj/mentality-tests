import { expect, request as playwrightRequest, test } from '@playwright/test';

import { AUTH_STATE_PATH } from '../global-setup';

const orgId = process.env.E2E_QDIP_ORGANIZATION_ID;

function adminPath(suffix = ''): string {
  if (!orgId) throw new Error('E2E_QDIP_ORGANIZATION_ID is required');
  return '/api/backend/dip-admin/organizations/' + orgId + suffix;
}

test('QDIP platform administrator can read sanitized organization data', async ({ request }) => {
  const response = await request.get('/api/backend/dip-admin/organizations');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  const organizations = await response.json();
  expect(Array.isArray(organizations)).toBe(true);
  expect(organizations.some((org: { id?: string }) => org.id === orgId)).toBe(true);

  const structure = await request.get(adminPath('/structure'));
  expect(structure.status()).toBe(200);
  const body = await structure.json();
  expect(body.organization.id).toBe(orgId);
  expect(Array.isArray(body.units)).toBe(true);
  expect(Array.isArray(body.members)).toBe(true);
});

test('QDIP administrative API rejects ordinary and company users', async ({ baseURL }) => {
  for (const state of [AUTH_STATE_PATH, 'playwright/.auth/zitadel-company.json']) {
    const user = await playwrightRequest.newContext({ baseURL, storageState: state });
    try {
      const response = await user.get('/api/backend/dip-admin/organizations');
      expect(response.status()).toBe(403);
      expect(response.headers()['cache-control']).toContain('no-store');
    } finally {
      await user.dispose();
    }
  }
});

test('QDIP organization keys never disclose secrets', async ({ request }) => {
  const response = await request.get(adminPath('/keys'));
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  const keys = await response.json();
  expect(Array.isArray(keys)).toBe(true);
  for (const key of keys) {
    expect(Object.keys(key)).not.toContain('key');
    expect(Object.keys(key)).not.toContain('key_hash');
    expect(Object.keys(key)).not.toContain('secret');
    expect(typeof key.key_prefix).toBe('string');
  }
});

test('QDIP write endpoint rejects unauthorized callers', async ({ baseURL }) => {
  // This uses a non-admin identity so no upstream mutation can be authorized.
  const user = await playwrightRequest.newContext({ baseURL, storageState: AUTH_STATE_PATH });
  try {
    const response = await user.post('/api/backend/dip-admin/organizations', {
      headers: {
        origin: new URL(baseURL!).origin,
        'Idempotency-Key': '4d5f6e70-1111-4111-8111-1234567890ab',
      },
      data: { name: 'MUST NOT CREATE' },
    });
    expect(response.status()).toBe(403);
  } finally {
    await user.dispose();
  }
});
