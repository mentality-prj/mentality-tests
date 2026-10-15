import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertQdipGate3Preflight } from './qdip-gate3-preflight.mjs';
import { assertQdipGate3Results, REQUIRED_QDIP_GATE3_CASES } from './qdip-gate3-results.mjs';

function env() {
  return {
    E2E_BASE_URL: 'https://mentality-web-git-gate3-taras-gezs-projects.vercel.app',
    E2E_QDIP_ORGANIZATION_ID: 'disposable-org',
    E2E_QDIP_KEY_ID: 'disposable-key',
    E2E_QDIP_AUDIT_DECISION_ID: 'disposable-audit',
    E2E_GATE3_WEB_SHA: 'a'.repeat(40),
    E2E_GATE3_BACKEND_SHA: 'b'.repeat(40),
    E2E_GATE3_DISPOSABLE_FIXTURES_CONFIRMED: '1',
    E2E_AUTH_STORAGE_STATE_BASE64: 'nonempty',
    E2E_ADMIN_STORAGE_STATE_BASE64: 'nonempty',
    E2E_COMPANY_STORAGE_STATE_BASE64: 'nonempty',
  };
}

function report() {
  return {
    suites: [{
      specs: REQUIRED_QDIP_GATE3_CASES.map((title) => ({
        title,
        tests: [{ projectName: 'qdip-admin-chromium', status: 'expected', results: [{ status: 'passed' }] }],
      })),
    }],
    errors: [],
  };
}

test('Gate 3 read-only preflight requires scoped nonproduction preview', () => {
  assert.equal(assertQdipGate3Preflight(env()), env().E2E_BASE_URL);
  for (const url of [
    'https://dzvin.co',
    'https://attacker.example',
    'https://mentality-web-git-production-taras-gezs-projects.vercel.app',
  ]) {
    assert.throws(() => assertQdipGate3Preflight({ ...env(), E2E_BASE_URL: url }));
  }
});

test('Gate 3 rejects missing test states, fixtures, SHA pins and confirmation', () => {
  for (const field of [
    'E2E_ADMIN_STORAGE_STATE_BASE64',
    'E2E_AUTH_STORAGE_STATE_BASE64',
    'E2E_COMPANY_STORAGE_STATE_BASE64',
    'E2E_QDIP_ORGANIZATION_ID',
    'E2E_QDIP_KEY_ID',
    'E2E_QDIP_AUDIT_DECISION_ID',
    'E2E_GATE3_WEB_SHA',
    'E2E_GATE3_BACKEND_SHA',
    'E2E_GATE3_DISPOSABLE_FIXTURES_CONFIRMED',
  ]) {
    assert.throws(() => assertQdipGate3Preflight({ ...env(), [field]: '' }), field);
  }
  assert.throws(() => assertQdipGate3Preflight({ ...env(), E2E_QDIP_ORGANIZATION_ID: '../prod' }));
});

test('Gate 3 report requires all six named browser cases', () => {
  assert.equal(assertQdipGate3Results(report()), REQUIRED_QDIP_GATE3_CASES.length);
  const missing = report();
  missing.suites[0].specs.pop();
  assert.throws(() => assertQdipGate3Results(missing), /not executed exactly once/);
});

test('Gate 3 report fails closed on retries, skips, wrong projects and duplicates', () => {
  const skipped = report();
  skipped.suites[0].specs[0].tests[0].status = 'skipped';
  assert.throws(() => assertQdipGate3Results(skipped), /Non-passing/);
  const retried = report();
  retried.suites[0].specs[0].tests[0].results.unshift({ status: 'failed' });
  assert.throws(() => assertQdipGate3Results(retried), /retried/);
  const wrong = report();
  wrong.suites[0].specs[0].tests[0].projectName = 'public-chromium';
  assert.throws(() => assertQdipGate3Results(wrong), /Unexpected project/);
  const duplicate = report();
  duplicate.suites[0].specs.push(duplicate.suites[0].specs[0]);
  assert.throws(() => assertQdipGate3Results(duplicate), /not executed exactly once/);
});
