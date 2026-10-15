import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PAIR_CASE = "qa1 and qa2 cannot read or select each other's company";

export function assertPairResults(report) {
  if (!report || !Array.isArray(report.suites) || report.errors?.length) {
    throw new Error('Two-QA report invalid or contains global errors');
  }
  const entries = [];
  const visit = (suites) => {
    for (const suite of suites) {
      for (const spec of suite.specs || []) {
        for (const entry of spec.tests || []) {
          entries.push({ name: spec.title, entry });
        }
      }
      visit(suite.suites || []);
    }
  };
  visit(report.suites);
  if (
    entries.length !== 1 ||
    entries[0].name !== PAIR_CASE ||
    entries[0].entry.projectName !== 'two-qa-company-chromium' ||
    entries[0].entry.status !== 'expected' ||
    entries[0].entry.results?.length !== 1 ||
    entries[0].entry.results[0].status !== 'passed'
  ) {
    throw new Error('Two-QA E2E FAIL: missing, skipped, retried, or failing required case');
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assertPairResults(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    console.log('Two-QA real company isolation PASS: no skips or retries');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
