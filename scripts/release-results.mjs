import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REQUIRED_PROJECTS = [
  'public-chromium',
  'authenticated-chromium',
  'admin-role-chromium',
  'company-role-chromium',
  'research-role-chromium',
  'refresh-concurrency-chromium',
  'disposable-mood-mutation-chromium',
  'zitadel-login-chromium',
  'qdip-admin-chromium',
];

/** A green job with skipped or absent projects is not release qualification. */
const REQUIRED_CASES = [
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

export function assertReleaseResults(report) {
  if (!report || typeof report !== 'object' || !Array.isArray(report.suites)) {
    throw new Error('Invalid Playwright JSON report');
  }
  const observed = new Map(REQUIRED_PROJECTS.map((name) => [name, 0]));
  const errors = [];
  const cases = new Set();
  function visit(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs || []) {
        for (const entry of spec.tests || []) {
          if (!observed.has(entry.projectName)) {
            errors.push('Unexpected test project');
            continue;
          }
          observed.set(entry.projectName, observed.get(entry.projectName) + 1);
          if (
            entry.status === 'expected' &&
            entry.results?.length === 1 &&
            entry.results[0].status === 'passed'
          ) {
            cases.add(spec.title);
          }
          if (
            entry.status !== 'expected' ||
            !Array.isArray(entry.results) ||
            entry.results.length !== 1 ||
            entry.results[0].status !== 'passed'
          ) {
            errors.push('Non-passing or skipped test in ' + entry.projectName);
          }
        }
      }
      visit(suite.suites || []);
    }
  }
  visit(report.suites);
  for (const [project, count] of observed) {
    if (count < 1) errors.push('Required E2E project missing: ' + project);
  }
  for (const title of REQUIRED_CASES) {
    if (!cases.has(title)) errors.push('Mandatory E2E case missing: ' + title);
  }
  if (Array.isArray(report.errors) && report.errors.length) {
    errors.push('Playwright global errors');
  }
  if (errors.length) {
    throw new Error('Release E2E rejected: ' + [...new Set(errors)].join('; '));
  }
  return [...observed.values()].reduce((sum, count) => sum + count, 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const count = assertReleaseResults(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    console.log('Release E2E PASS: ' + count + ' tests, all 9 projects, no skips or retries');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
