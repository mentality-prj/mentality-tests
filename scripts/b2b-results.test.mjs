import assert from 'node:assert/strict';
import test from 'node:test';

import { assertB2BResults, REQUIRED_B2B_CASES } from './b2b-results.mjs';

function report() {
  return {
    suites: [{
      specs: REQUIRED_B2B_CASES.map((title) => ({
        title,
        tests: [{
          projectName: 'b2b-isolation-chromium',
          status: 'expected',
          results: [{ status: 'passed' }],
        }],
      })),
    }],
    errors: [],
  };
}

test('Gate 2 accepts only a complete real nonflaky B2B test report', () => {
  assert.equal(assertB2BResults(report()), REQUIRED_B2B_CASES.length);
});

test('Gate 2 rejects missing or duplicated B2B security cases', () => {
  const missing = report();
  missing.suites[0].specs.pop();
  assert.throws(() => assertB2BResults(missing), /Required B2B test missing/);

  const duplicate = report();
  duplicate.suites[0].specs.push(duplicate.suites[0].specs[0]);
  assert.throws(() => assertB2BResults(duplicate), /Duplicate B2B test/);
});

test('Gate 2 rejects skipped, failed, or flaky retries', () => {
  for (const status of ['skipped', 'unexpected']) {
    const bad = report();
    bad.suites[0].specs[0].tests[0].status = status;
    assert.throws(() => assertB2BResults(bad), /Skipped, retried or failing/);
  }
  const retry = report();
  retry.suites[0].specs[0].tests[0].results.unshift({ status: 'failed' });
  assert.throws(() => assertB2BResults(retry), /Skipped, retried or failing/);
});

test('Gate 2 rejects unexpected projects and global test errors', () => {
  const badProject = report();
  badProject.suites[0].specs[0].tests[0].projectName = 'public-chromium';
  assert.throws(() => assertB2BResults(badProject), /Unexpected B2B test project/);

  const globalError = report();
  globalError.errors.push('failure');
  assert.throws(() => assertB2BResults(globalError), /Playwright global errors/);
});
