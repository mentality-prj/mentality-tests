import { pathToFileURL } from 'node:url';

import { assertPublicPreviewOrigin } from './public-preflight.mjs';

const REQUIRED = [
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
];

/** Fail closed before any remote navigation or state-changing test. */
export function assertReleasePreflight(env) {
  const failures = [];
  let app;
  try {
    app = new URL(assertPublicPreviewOrigin(env.E2E_BASE_URL));
  } catch (error) {
    failures.push(error.message);
  }
  if (env.E2E_DISPOSABLE_TENANT_CONFIRMED !== '1') {
    failures.push('E2E_DISPOSABLE_TENANT_CONFIRMED must be 1');
  }
  if (!app || env.E2E_ALLOWED_MUTATION_ORIGIN !== app.origin) {
    failures.push('E2E_ALLOWED_MUTATION_ORIGIN must exactly match the preview origin');
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(env.E2E_QDIP_ORGANIZATION_ID ?? '')) {
    failures.push('E2E_QDIP_ORGANIZATION_ID must reference a disposable QDIP organization');
  }
  for (const name of ['E2E_QDIP_KEY_ID', 'E2E_QDIP_AUDIT_DECISION_ID']) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(env[name] ?? '')) {
      failures.push(name + ' must reference a disposable QDIP fixture');
    }
  }
  const foreign = env.E2E_FOREIGN_RESOURCE_PATH;
  if (
    !foreign ||
    !/^\/api\/backend\/[A-Za-z0-9/_?&=.%~-]+$/.test(foreign) ||
    foreign.includes('..')
  ) {
    failures.push('E2E_FOREIGN_RESOURCE_PATH must be a known foreign-tenant GET resource');
  }
  for (const name of REQUIRED) {
    if (typeof env[name] !== 'string' || !env[name].trim()) {
      failures.push(name + ' is required');
    }
  }
  if (failures.length) {
    throw new Error('Release E2E preflight refused: ' + failures.join('; '));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assertReleasePreflight(process.env);
    console.log('Release preflight PASS: isolation and credential gates satisfied');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
