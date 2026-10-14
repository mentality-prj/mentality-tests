import assert from 'node:assert/strict';
import test from 'node:test';

import { assertB2BPreflight } from './b2b-preflight.mjs';

function fixtureEnv() {
  const ids = [
    'E2E_B2B_COMPANY_A_ID',
    'E2E_B2B_COMPANY_B_ID',
    'E2E_B2B_GROUP_A_ID',
    'E2E_B2B_GROUP_A_OUTSIDE_SCOPE_ID',
    'E2E_B2B_GROUP_B_ID',
    'E2E_B2B_MULTI_INVITE_A_ID',
    'E2E_B2B_MULTI_INVITE_B_ID',
    'E2E_B2B_USER_A_ID',
    'E2E_B2B_USER_B_ID',
    'E2E_B2B_SALARY_GRADE_B_ID',
  ];
  const states = [
    'E2E_ADMIN_STORAGE_STATE_BASE64',
    'E2E_B2B_A_ADMIN_STORAGE_STATE_BASE64',
    'E2E_B2B_B_ADMIN_STORAGE_STATE_BASE64',
    'E2E_B2B_A_MANAGER_STORAGE_STATE_BASE64',
    'E2E_B2B_A_EMPLOYEE_STORAGE_STATE_BASE64',
    'E2E_B2B_MULTI_STORAGE_STATE_BASE64',
    'E2E_B2B_NO_COMPANY_STORAGE_STATE_BASE64',
  ];
  return {
    E2E_BASE_URL: 'https://isolated-preview.example',
    E2E_DISPOSABLE_TENANT_CONFIRMED: '1',
    ...Object.fromEntries(ids.map((id, index) => [id, (index + 1).toString(16).padStart(24, '0')])),
    ...Object.fromEntries(states.map((state) => [state, 'test-only-not-a-credential'])),
  };
}

test('B2B E2E accepts complete disposable fixtures and test identities', () => {
  assert.doesNotThrow(() => assertB2BPreflight(fixtureEnv()));
});

test('B2B E2E rejects production origin and non-disposable environment', () => {
  assert.throws(() => assertB2BPreflight({ ...fixtureEnv(), E2E_BASE_URL: 'https://dzvin.co' }));
  assert.throws(() =>
    assertB2BPreflight({ ...fixtureEnv(), E2E_DISPOSABLE_TENANT_CONFIRMED: '0' }),
  );
});

test('B2B E2E refuses missing identities, malformed IDs and colliding tenants', () => {
  assert.throws(() =>
    assertB2BPreflight({ ...fixtureEnv(), E2E_B2B_MULTI_STORAGE_STATE_BASE64: '' }),
  );
  assert.throws(() => assertB2BPreflight({ ...fixtureEnv(), E2E_B2B_GROUP_A_ID: 'not-object-id' }));
  assert.throws(() =>
    assertB2BPreflight({
      ...fixtureEnv(),
      E2E_B2B_COMPANY_B_ID: fixtureEnv().E2E_B2B_COMPANY_A_ID,
    }),
  );
});
