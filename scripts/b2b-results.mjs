import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REQUIRED_B2B_CASES = [
  'distinct company owners cannot read the other company or its resources',
  'global platform admin without membership has no implicit B2B access',
  'manager sees only granted subtree; employee cannot read analytics',
  'denied invitations cannot elevate manager or cross group/company boundaries',
  'manager invitation list is isolated by requested company',
  'multi-company selector validates each switch server-side',
  'zero-membership identity never receives company authority',
  'stale company selection cannot grant access to a former or foreign tenant',
  'anonymous and forged company-header requests cannot bypass BFF authorization',
  'real browser company switch and direct URL role guards survive navigation',
  'foreign company mutations are rejected before any data can change',
  'manager cannot change company administrator roles or access scopes',
  'canonical company promotion and demotion are reflected in a real employee session',
  'the final company administrator cannot demote themselves',
];

export function assertB2BResults(report) {
  if (!report || !Array.isArray(report.suites)) {
    throw new Error('Invalid B2B Playwright JSON report');
  }
  const seen = new Set();
  const failures = [];
  let count = 0;
  const visit = (suites) => {
    for (const suite of suites) {
      for (const spec of suite.specs || []) {
        for (const entry of spec.tests || []) {
          count++;
          if (entry.projectName !== 'b2b-isolation-chromium') {
            failures.push('Unexpected B2B test project');
          }
          if (
            entry.status !== 'expected' ||
            !Array.isArray(entry.results) ||
            entry.results.length !== 1 ||
            entry.results[0].status !== 'passed'
          ) {
            failures.push('Skipped, retried or failing B2B test: ' + spec.title);
          } else if (seen.has(spec.title)) {
            failures.push('Duplicate B2B test: ' + spec.title);
          } else {
            seen.add(spec.title);
          }
        }
      }
      visit(suite.suites || []);
    }
  };
  visit(report.suites);
  for (const title of REQUIRED_B2B_CASES) {
    if (!seen.has(title)) failures.push('Required B2B test missing: ' + title);
  }
  if (count !== REQUIRED_B2B_CASES.length) {
    failures.push('Unexpected B2B case count: ' + count);
  }
  if (report.errors?.length) failures.push('Playwright global errors');
  if (failures.length) {
    throw new Error('Gate 2 B2B E2E FAIL: ' + [...new Set(failures)].join('; '));
  }
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const count = assertB2BResults(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    console.log('Gate 2 B2B E2E PASS: ' + count + ' real tests, no skips or retries');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
