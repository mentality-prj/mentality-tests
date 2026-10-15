import { pathToFileURL } from 'node:url';

import { assertPublicPreviewOrigin } from './public-preflight.mjs';

const REQUIRED_SESSIONS = [
  'E2E_AUTH_STORAGE_STATE_BASE64',
  'E2E_ADMIN_STORAGE_STATE_BASE64',
  'E2E_COMPANY_STORAGE_STATE_BASE64',
];
const REQUIRED_FIXTURES = [
  'E2E_QDIP_ORGANIZATION_ID',
  'E2E_QDIP_KEY_ID',
  'E2E_QDIP_AUDIT_DECISION_ID',
];

/**
 * Read-only Gate 3 browser suite. Mutations by an authorized administrator
 * are NEVER executed here: a separate isolated integration gate owns them.
 */
export function assertQdipGate3Preflight(env) {
  const failures = [];
  let origin;
  try {
    origin = assertPublicPreviewOrigin(env.E2E_BASE_URL);
    const host = new URL(origin).hostname;
    if (!/^mentality(?:-web)?-[a-z0-9-]+-taras-gezs-projects\.vercel\.app$/.test(host)) {
      failures.push('E2E_BASE_URL must be an approved Dzvin Vercel preview');
    }
  } catch (error) {
    failures.push(error.message);
  }
  for (const name of REQUIRED_SESSIONS) {
    if (typeof env[name] !== 'string' || !env[name].trim()) {
      failures.push(name + ' is required');
    }
  }
  for (const name of REQUIRED_FIXTURES) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(env[name] ?? '')) {
      failures.push(name + ' must identify an isolated nonproduction fixture');
    }
  }
  for (const name of ['E2E_GATE3_WEB_SHA', 'E2E_GATE3_BACKEND_SHA']) {
    if (!/^[0-9a-f]{40}$/i.test(env[name] ?? '')) {
      failures.push(name + ' must pin an exact 40-character source SHA');
    }
  }
  if (env.E2E_GATE3_DISPOSABLE_FIXTURES_CONFIRMED !== '1') {
    failures.push('E2E_GATE3_DISPOSABLE_FIXTURES_CONFIRMED must be 1');
  }
  if (failures.length > 0) {
    throw new Error('QDIP Gate 3 preflight refused: ' + failures.join('; '));
  }
  return origin;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assertQdipGate3Preflight(process.env);
    console.log('QDIP Gate 3 preflight PASS (environment only; live browser not yet qualified)');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
