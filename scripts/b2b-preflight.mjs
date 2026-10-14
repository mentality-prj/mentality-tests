import { pathToFileURL } from 'node:url';

import { assertPublicPreviewOrigin } from './public-preflight.mjs';

const SESSIONS = [
  'E2E_ADMIN_STORAGE_STATE_BASE64',
  'E2E_B2B_A_ADMIN_STORAGE_STATE_BASE64',
  'E2E_B2B_B_ADMIN_STORAGE_STATE_BASE64',
  'E2E_B2B_A_MANAGER_STORAGE_STATE_BASE64',
  'E2E_B2B_A_EMPLOYEE_STORAGE_STATE_BASE64',
  'E2E_B2B_MULTI_STORAGE_STATE_BASE64',
  'E2E_B2B_NO_COMPANY_STORAGE_STATE_BASE64',
];

const IDS = [
  'E2E_B2B_COMPANY_A_ID',
  'E2E_B2B_COMPANY_B_ID',
  'E2E_B2B_GROUP_A_ID',
  'E2E_B2B_GROUP_A_OUTSIDE_SCOPE_ID',
  'E2E_B2B_GROUP_B_ID',
  'E2E_B2B_MULTI_INVITE_A_ID',
  'E2E_B2B_MULTI_INVITE_B_ID',
  'E2E_B2B_USER_A_ID',
  'E2E_B2B_USER_B_ID',
  'E2E_B2B_SALARY_GRADE_B_ID',
];

export function assertB2BPreflight(env) {
  const failures = [];
  try {
    assertPublicPreviewOrigin(env.E2E_BASE_URL);
  } catch (error) {
    failures.push(error.message);
  }

  if (env.E2E_DISPOSABLE_TENANT_CONFIRMED !== '1') {
    failures.push('E2E_DISPOSABLE_TENANT_CONFIRMED must be 1');
  }

  const used = new Set();
  for (const name of IDS) {
    const value = env[name];
    if (typeof value !== 'string' || !/^[0-9a-f]{24}$/i.test(value)) {
      failures.push(name + ' must be a valid seeded ObjectId');
    } else if (used.has(value.toLowerCase())) {
      failures.push(name + ' must be distinct from other fixture IDs');
    } else {
      used.add(value.toLowerCase());
    }
  }
  for (const name of SESSIONS) {
    if (typeof env[name] !== 'string' || !env[name].trim()) {
      failures.push(name + ' must be set for the dedicated E2E identity');
    }
  }

  if (failures.length) {
    throw new Error('B2B E2E preflight refused: ' + failures.join('; '));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assertB2BPreflight(process.env);
    console.log('B2B E2E preflight PASS: disposable multi-company fixture variables present');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
