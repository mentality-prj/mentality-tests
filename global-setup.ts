import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const AUTH_STATE_PATH = join(process.cwd(), 'playwright', '.auth', 'zitadel-user.json');

type SessionState = {
  cookies: Array<{
    name: string;
    domain: string;
    value: string;
    expires: number;
    httpOnly: boolean;
  }>;
  origins: unknown[];
};

export async function prepareAuthState(): Promise<void> {
  const app = new URL(process.env.E2E_BASE_URL ?? '');
  if (!['http:', 'https:'].includes(app.protocol)) {
    throw new Error('E2E_BASE_URL must use HTTP(S)');
  }
  const storageEntries: Array<[string, string]> = [];
  if (process.env.RUN_AUTH_E2E === '1') {
    storageEntries.push(['E2E_AUTH_STORAGE_STATE_BASE64', AUTH_STATE_PATH]);
  }
  if (process.env.RUN_ROLE_E2E === '1') {
    storageEntries.push(
      [
        'E2E_ADMIN_STORAGE_STATE_BASE64',
        join(process.cwd(), 'playwright/.auth/zitadel-admin.json'),
      ],
      [
        'E2E_COMPANY_STORAGE_STATE_BASE64',
        join(process.cwd(), 'playwright/.auth/zitadel-company.json'),
      ],
      [
        'E2E_RESEARCH_STORAGE_STATE_BASE64',
        join(process.cwd(), 'playwright/.auth/zitadel-research.json'),
      ],
    );
  }
  if (process.env.RUN_LIFECYCLE_E2E === '1') {
    storageEntries.push([
      'E2E_LIFECYCLE_STORAGE_STATE_BASE64',
      join(process.cwd(), 'playwright/.auth/zitadel-lifecycle.json'),
    ]);
  }
  if (process.env.RUN_MOOD_MUTATION_E2E === '1') {
    storageEntries.push([
      'E2E_MUTATION_STORAGE_STATE_BASE64',
      join(process.cwd(), 'playwright/.auth/zitadel-mutation.json'),
    ]);
  }
  for (const [envKey, destination] of storageEntries) {
    const encoded = process.env[envKey];
    if (!encoded) throw new Error(envKey + ' is required for selected E2E project');
    let state: SessionState;
    try {
      state = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as SessionState;
    } catch {
      throw new Error(envKey + ' must contain base64 Playwright storageState JSON');
    }
    validateAndWrite(state, app, destination);
  }
}

function validateAndWrite(state: SessionState, app: URL, destination: string): void {
  if (!Array.isArray(state.cookies) || !Array.isArray(state.origins)) {
    throw new Error('Invalid Playwright storageState structure');
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  const matching = state.cookies.find(
    (cookie) =>
      cookie.name === 'auth-tokens' &&
      cookie.httpOnly === true &&
      Boolean(cookie.value) &&
      (cookie.expires === -1 || cookie.expires > nowSeconds) &&
      (app.hostname === cookie.domain.replace(/^\./, '') ||
        app.hostname.endsWith('.' + cookie.domain.replace(/^\./, ''))),
  );
  if (!matching) {
    throw new Error(
      'Session state lacks a non-expired HttpOnly auth-tokens cookie for E2E_BASE_URL',
    );
  }
  mkdirSync(join(process.cwd(), 'playwright', '.auth'), { recursive: true });
  writeFileSync(destination, JSON.stringify(state), { mode: 0o600 });
  // Never print the state, cookies or bearer credentials.
}

export default prepareAuthState;
