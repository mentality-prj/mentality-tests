import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertTwoQaPreflight } from './b2b-pair-preflight.mjs';
import { assertPairResults, PAIR_CASE } from './b2b-pair-results.mjs';

const env = {
  E2E_BASE_URL: 'https://dzvin-qa-preview.example',
  E2E_QA1_USERNAME: 'qa1@qdip.ai',
  E2E_QA2_USERNAME: 'qa2@qdip.ai',
  E2E_QA1_PASSWORD: 'local-fake-secret-a',
  E2E_QA2_PASSWORD: 'local-fake-secret-b',
  E2E_ZITADEL_USERNAME_SELECTOR: '[name="loginName"]',
  E2E_ZITADEL_PASSWORD_SELECTOR: '[name="password"]',
  E2E_ZITADEL_SUBMIT_SELECTOR: '[type="submit"]',
};

test('two-account preflight accepts only a nonproduction preview and two accounts', () => {
  assert.doesNotThrow(() => assertTwoQaPreflight(env));
});

test('two-account preflight rejects malformed second email without guessing', () => {
  assert.throws(
    () => assertTwoQaPreflight({ ...env, E2E_QA2_USERNAME: 'qa2.qdip.ai' }),
    /E2E_QA2_USERNAME must be a valid full email/,
  );
});

test('two-account preflight rejects missing credentials and duplicate users', () => {
  assert.throws(
    () =>
      assertTwoQaPreflight({
        ...env,
        E2E_QA2_USERNAME: env.E2E_QA1_USERNAME,
        E2E_QA2_PASSWORD: '',
      }),
    /two QA identities must be distinct|The two QA identities must be distinct/,
  );
});

test('two-account preflight refuses production hostname and missing selectors', () => {
  assert.throws(
    () =>
      assertTwoQaPreflight({
        ...env,
        E2E_BASE_URL: 'https://dzvin.co',
        E2E_ZITADEL_SUBMIT_SELECTOR: '',
      }),
    /production hostname/,
  );
});

const report = (status = 'passed') => ({
  suites: [
    {
      specs: [
        {
          title: PAIR_CASE,
          tests: [
            {
              projectName: 'two-qa-company-chromium',
              status: status === 'passed' ? 'expected' : 'unexpected',
              results: [{ status }],
            },
          ],
        },
      ],
    },
  ],
  errors: [],
});

test('two-account results require one real case without skips or retries', () => {
  assert.equal(assertPairResults(report()), 1);
  assert.throws(() => assertPairResults(report('skipped')), /FAIL/);
  assert.throws(() => assertPairResults({ ...report(), suites: [] }), /FAIL/);
  const duplicated = report();
  duplicated.suites[0].specs[0].tests.push({
    projectName: 'two-qa-company-chromium',
    status: 'expected',
    results: [{ status: 'passed' }],
  });
  assert.throws(() => assertPairResults(duplicated), /FAIL/);
});
