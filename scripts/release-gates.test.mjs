import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertPublicPreviewOrigin } from './public-preflight.mjs';
import { assertReleasePreflight } from './release-preflight.mjs';
import { assertReleaseResults, REQUIRED_PROJECTS } from './release-results.mjs';

function env() {
  return {
    E2E_QDIP_ORGANIZATION_ID: 'disposable-qdip-org',
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

const MANDATORY = [
  'real Zitadel authorization-code + PKCE login round-trip',
  'expired session refresh remains valid during concurrent tab navigation',
  'authenticated same-origin mood write persists under a disposable tenant',
  'cross-tenant resource ID is inaccessible',
  'backend-verified administrator accesses the admin UI',
  'company identity accesses company, but not global admin',
  'scientist / research_admin accesses research, not global admin',
  'QDIP platform administrator can read sanitized organization data',
  'QDIP administrative API rejects ordinary and company users',
  'QDIP organization keys never disclose secrets',
  'QDIP write endpoint rejects unauthorized callers',
  'authenticated mobile pages render without horizontal overflow',
  'protected SSR survives locale navigation and hard reload',
];

function report() {
  return {
    suites: [
      {
        specs: MANDATORY.map((title, index) => ({
          title,
          tests: [
            {
              projectName: REQUIRED_PROJECTS[index % REQUIRED_PROJECTS.length],
              status: 'expected',
              results: [{ status: 'passed' }],
            },
          ],
        })),
      },
    ],
    errors: [],
  };
}

test('public smoke requires an explicit HTTPS nonproduction preview origin', () => {
  assert.equal(
    assertPublicPreviewOrigin('https://isolated-preview.vercel.app'),
    'https://isolated-preview.vercel.app',
  );
  assert.throws(() => assertPublicPreviewOrigin(''), /E2E_BASE_URL is missing/);
  assert.throws(() => assertPublicPreviewOrigin('https://dzvin.co'), /production/);
  assert.throws(() => assertPublicPreviewOrigin('https://www.dzvin.co'), /production/);
  assert.throws(
    () => assertPublicPreviewOrigin('https://mentality-web-git-production-acct.vercel.app'),
    /production/,
  );
  assert.throws(
    () => assertPublicPreviewOrigin('https://isolated-preview.vercel.app/path'),
    /HTTPS origin/,
  );
  assert.throws(
    () => assertPublicPreviewOrigin('http://isolated-preview.vercel.app'),
    /HTTPS origin/,
  );
});
test('privileged gate requires the same nonproduction preview boundary as public smoke', () => {
  assert.throws(
    () => assertReleasePreflight({ ...env(), E2E_BASE_URL: '' }),
    /E2E_BASE_URL is missing/,
  );
  assert.throws(
    () =>
      assertReleasePreflight({
        ...env(),
        E2E_BASE_URL: 'https://mentality-web-git-production-acct.vercel.app',
      }),
    /production/,
  );
});
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
test('requires all nine Playwright projects', () => {
  assert.equal(assertReleaseResults(report()), MANDATORY.length);
  const r = report();
  r.suites[0].specs = r.suites[0].specs.filter(
    (spec) => spec.tests[0].projectName !== 'qdip-admin-chromium',
  );
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

test('requires every mandatory test case and rejects flaky retry success', () => {
  const missing = report();
  missing.suites[0].specs = missing.suites[0].specs.filter((spec) => spec.title !== MANDATORY[0]);
  assert.throws(() => assertReleaseResults(missing), /Mandatory E2E case missing/);
  const flaky = report();
  flaky.suites[0].specs[0].tests[0].results.unshift({ status: 'failed' });
  assert.throws(() => assertReleaseResults(flaky), /Non-passing or skipped/);
});
test('requires an explicit disposable QDIP organization', () => {
  assert.throws(() => assertReleasePreflight({ ...env(), E2E_QDIP_ORGANIZATION_ID: '' }));
});
