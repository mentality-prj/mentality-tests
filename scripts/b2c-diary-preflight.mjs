import { pathToFileURL } from 'node:url';

import { assertPublicPreviewOrigin } from './public-preflight.mjs';

/**
 * Strict opt-in for destructive E2E. This validates input provenance only;
 * supplied SHAs must also be reconciled with actual Vercel and NestJS deploys.
 */
export function assertDiaryPrivacyPreflight(env) {
  const errors = [];
  let origin = null;
  try {
    origin = assertPublicPreviewOrigin(env.E2E_BASE_URL);
  } catch (error) {
    errors.push(error.message);
  }
  if (!origin || env.E2E_ALLOWED_MUTATION_ORIGIN !== origin) {
    errors.push('E2E_ALLOWED_MUTATION_ORIGIN must exactly match E2E_BASE_URL');
  }
  // Existing backend is supported only with explicit, pinned QA identities.
  // Never interpret "shared" as permission to mutate other users' records.
  const disposable = env.E2E_DISPOSABLE_TENANT_CONFIRMED === '1';
  const scopedQa = env.E2E_QA_SHARED_BACKEND_SCOPED_APPROVED === '1';
  if (!disposable && !scopedQa) {
    errors.push('Explicit disposable tenant OR scoped existing-backend QA approval is required');
  }
  if (scopedQa) {
    const a = env.E2E_QA_A_USER_ID;
    const b = env.E2E_QA_B_USER_ID;
    if (typeof a !== 'string' || !a.trim() || typeof b !== 'string' || !b.trim() || a === b) {
      errors.push('Shared-backend E2E requires two distinct pinned server-verified QA user IDs');
    }
  }
  for (const key of ['E2E_B2C_A_STORAGE_STATE_BASE64', 'E2E_B2C_B_STORAGE_STATE_BASE64']) {
    if (typeof env[key] !== 'string' || !env[key]) errors.push(key + ' is required');
  }
  for (const key of ['E2E_DEPLOYED_WEB_SHA', 'E2E_DEPLOYED_BACKEND_SHA']) {
    if (!/^[0-9a-f]{40}$/i.test(env[key] || '')) errors.push(key + ' must be an exact 40-character SHA');
  }
  if (errors.length) {
    throw new Error('B2C diary E2E PRE-FLIGHT FAILED: ' + errors.join('; '));
  }
  return { origin };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { origin } = assertDiaryPrivacyPreflight(process.env);
    console.log('B2C diary E2E preflight PASS for preview host ' + new URL(origin).hostname);
    console.log('Supplied release SHAs are format-valid; actual deployment parity still requires independent proof');
    console.log(
      'Diary E2E scope: ' +
        (process.env.E2E_QA_SHARED_BACKEND_SCOPED_APPROVED === '1'
          ? 'pinned QA users on existing backend'
          : 'disposable tenant'),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
