import { expect, request as playwrightRequest, test } from '@playwright/test';

import { AUTH_STATE_PATH } from '../global-setup';

const orgId = process.env.E2E_QDIP_ORGANIZATION_ID;
const auditDecisionId = process.env.E2E_QDIP_AUDIT_DECISION_ID;
const keyId = process.env.E2E_QDIP_KEY_ID;

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
      for (const path of [
        '/api/backend/dip-admin/organizations',
        adminPath('/keys'),
        adminPath('/audit?limit=10'),
      ]) {
        const response = await user.get(path);
        expect(response.status(), path).toBe(403);
        expect(response.headers()['cache-control']).toContain('no-store');
      }
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
  // A real disposable key fixture is required. An empty list cannot prove
  // redaction of actual API key metadata.
  expect(keys.some((key: { id?: string }) => key.id === keyId)).toBe(true);
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

test('anonymous callers cannot read QDIP administrative resources', async ({ baseURL }) => {
  const anonymous = await playwrightRequest.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  try {
    for (const path of ['/api/backend/dip-admin/organizations', adminPath('/keys')]) {
      const response = await anonymous.get(path);
      expect(response.status(), path).toBe(401);
      expect(response.headers()['cache-control']).toContain('no-store');
    }
  } finally {
    await anonymous.dispose();
  }
});

test('QDIP audit fixture suppresses raw feature values and rule evidence', async ({ request }) => {
  const response = await request.get(adminPath('/audit?limit=100'));
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  const rows = await response.json();
  expect(Array.isArray(rows)).toBe(true);
  const decision = rows.find((item: { decision_id?: string }) => item.decision_id === auditDecisionId);
  expect(decision).toBeDefined();
  expect(decision.features_used).toEqual({});
  expect(typeof decision.features_count).toBe('number');
  expect(Array.isArray(decision.rules_executed)).toBe(true);
  expect(decision.rules_executed.length).toBeGreaterThan(0);
  for (const rule of decision.rules_executed) {
    expect(Object.keys(rule)).not.toContain('evidence');
  }
});
