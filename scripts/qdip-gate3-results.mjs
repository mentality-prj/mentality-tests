import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REQUIRED_QDIP_GATE3_CASES = [
  'QDIP platform administrator can read sanitized organization data',
  'QDIP administrative API rejects ordinary and company users',
  'QDIP organization keys never disclose secrets',
  'QDIP write endpoint rejects unauthorized callers',
  'anonymous callers cannot read QDIP administrative resources',
  'QDIP audit fixture suppresses raw feature values and rule evidence',
];

/** The standalone read-only gate never substitutes for QDIP write qualification. */
export function assertQdipGate3Results(report) {
  if (!report || !Array.isArray(report.suites)) {
    throw new Error('Invalid QDIP Gate 3 Playwright report');
  }
  const seen = new Map();
  const errors = [];
  function visit(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs || []) {
        for (const entry of spec.tests || []) {
          if (entry.projectName !== 'qdip-admin-chromium') {
            errors.push('Unexpected project');
            continue;
          }
          seen.set(spec.title, (seen.get(spec.title) ?? 0) + 1);
          if (
            entry.status !== 'expected' ||
            !Array.isArray(entry.results) ||
            entry.results.length !== 1 ||
            entry.results[0].status !== 'passed'
          ) {
            errors.push('Non-passing or retried QDIP test');
          }
        }
      }
      visit(suite.suites || []);
    }
  }
  visit(report.suites);
  for (const title of REQUIRED_QDIP_GATE3_CASES) {
    if (seen.get(title) !== 1) errors.push('Required QDIP case not executed exactly once: ' + title);
  }
  if (Array.isArray(report.errors) && report.errors.length > 0) {
    errors.push('Playwright global errors');
  }
  if (errors.length) {
    throw new Error('QDIP Gate 3 read-only E2E rejected: ' + [...new Set(errors)].join('; '));
  }
  return [...seen.values()].reduce((sum, count) => sum + count, 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const count = assertQdipGate3Results(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    console.log('QDIP Gate 3 read-only E2E PASS: ' + count + ' tests, zero skips or retries');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
