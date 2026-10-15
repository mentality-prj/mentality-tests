import { pathToFileURL } from 'node:url';

import { assertPublicPreviewOrigin } from './public-preflight.mjs';

export function assertTwoQaPreflight(env) {
  const failures = [];
  try {
    assertPublicPreviewOrigin(env.E2E_BASE_URL);
  } catch (error) {
    failures.push(error.message);
  }
  const identities = [
    ['E2E_QA1_USERNAME', 'E2E_QA1_PASSWORD'],
    ['E2E_QA2_USERNAME', 'E2E_QA2_PASSWORD'],
  ];
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const [usernameKey, passwordKey] of identities) {
    if (!validEmail.test(env[usernameKey] ?? '')) {
      failures.push(usernameKey + ' must be a valid full email address');
    }
    if (typeof env[passwordKey] !== 'string' || !env[passwordKey]) {
      failures.push(passwordKey + ' is required in the protected e2e environment');
    }
  }
  if (
    env.E2E_QA1_USERNAME &&
    env.E2E_QA2_USERNAME &&
    env.E2E_QA1_USERNAME.toLowerCase() === env.E2E_QA2_USERNAME.toLowerCase()
  ) {
    failures.push('The two QA identities must be distinct');
  }
  for (const key of [
    'E2E_ZITADEL_USERNAME_SELECTOR',
    'E2E_ZITADEL_PASSWORD_SELECTOR',
    'E2E_ZITADEL_SUBMIT_SELECTOR',
  ]) {
    if (typeof env[key] !== 'string' || !env[key].trim()) {
      failures.push(key + ' must be explicitly configured for the Zitadel login UI');
    }
  }
  if (failures.length) {
    throw new Error('Two-account company E2E preflight refused: ' + failures.join('; '));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assertTwoQaPreflight(process.env);
    console.log('Two-account company preflight PASS: nonproduction preview, two identities');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
