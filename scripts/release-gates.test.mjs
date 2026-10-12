import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertReleasePreflight } from './release-preflight.mjs';
import { assertReleaseResults, REQUIRED_PROJECTS } from './release-results.mjs';

function env() {
  return {
    E2E_BASE_URL: 'https://isolated-preview.vercel.app',
    E2E_ALLOWED_MUTATION_ORIGIN: 'https://isolated-preview.vercel.app',
    E2E_DISPOSABLE_TENANT_CONFIRMED: '1',
    E2E_FOREIGN_RESOURCE_PATH: '/api/backend/companies/foreign-test-id',
    ...Object.fromEntries(
      [
        'E2E_AUTH_STORAGE_STATE_BASE64',
        'E2E_ADMIN_STORAGE_STATE_BASE64',
        'E2E_COMPANY_STORAGE_STATE_BASE64',
        'E2E_RESEARCH_STORAGE_STATE_BASE64',
        'E2E_LIFECYCLE_STORAGE_STATE_BASE64',
        'E2E_MUTATION_STORAGE_STATE_BASE64',
        'E2E_ZITADEL_USERNAME',
        'E2E_ZITADEL_PASSWORD',
        'E2E_ZITADEL_USERNAME_SELECTOR',
        'E2E_ZITADEL_PASSWORD_SELECTOR',
        'E2E_ZITADEL_SUBMIT_SELECTOR',
      ].map((name) => [name, 'fake-value']),
    ),
  };
}

function report() {
  return {
    suites: [
      {
        specs: REQUIRED_PROJECTS.map((projectName) => ({
          tests: [{ projectName, status: 'expected', results: [{ status: 'passed' }] }],
        })),
      },
    ],
    errors: [],
  };
}

test('accepts a dedicated HTTPS preview with complete test environment', () => {
  assert.doesNotThrow(() => assertReleasePreflight(env()));
});
test('rejects production hosts and mismatching mutation origin', () => {
  assert.throws(() => assertReleasePreflight({ ...env(), E2E_BASE_URL: 'https://dzvin.co' }));
  assert.throws(() =>
    assertReleasePreflight({ ...env(), E2E_ALLOWED_MUTATION_ORIGIN: 'https://other.invalid' }),
  );
});
test('requires foreign-tenant path and explicit disposable test tenant', () => {
  assert.throws(() => assertReleasePreflight({ ...env(), E2E_FOREIGN_RESOURCE_PATH: '' }));
  assert.throws(() => assertReleasePreflight({ ...env(), E2E_DISPOSABLE_TENANT_CONFIRMED: '0' }));
});
test('rejects a missing test identity or login selector', () => {
  assert.throws(() => assertReleasePreflight({ ...env(), E2E_ZITADEL_PASSWORD: '' }));
});
test('requires all eight Playwright projects', () => {
  assert.equal(assertReleaseResults(report()), 8);
  const r = report();
  r.suites[0].specs.pop();
  assert.throws(() => assertReleaseResults(r), /Required E2E project missing/);
});
test('rejects skipped, failing, and empty test results', () => {
  for (const status of ['skipped', 'unexpected']) {
    const r = report();
    r.suites[0].specs[0].tests[0].status = status;
    assert.throws(() => assertReleaseResults(r));
  }
  const r = report();
  r.suites[0].specs[0].tests[0].results = [{ status: 'failed' }];
  assert.throws(() => assertReleaseResults(r));
});
