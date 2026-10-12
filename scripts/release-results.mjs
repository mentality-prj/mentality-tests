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
];

/** A green job with skipped or absent projects is not release qualification. */
export function assertReleaseResults(report) {
  if (!report || typeof report !== 'object' || !Array.isArray(report.suites)) {
    throw new Error('Invalid Playwright JSON report');
  }
  const observed = new Map(REQUIRED_PROJECTS.map((name) => [name, 0]));
  const errors = [];
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
            entry.status !== 'expected' ||
            !entry.results?.some((result) => result.status === 'passed')
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
    console.log('Release E2E PASS: ' + count + ' tests, all 8 projects, no skips');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
