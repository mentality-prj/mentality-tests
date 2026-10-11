import 'dotenv/config';
import type { FullConfig } from '@playwright/test';
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

export async function prepareAuthState(_config: FullConfig): Promise<void> {
  const encoded = process.env.E2E_AUTH_STORAGE_STATE_BASE64;
  if (!encoded) {
    throw new Error('RUN_AUTH_E2E requires E2E_AUTH_STORAGE_STATE_BASE64');
  }
  const app = new URL(process.env.E2E_BASE_URL ?? '');
  if (!['http:', 'https:'].includes(app.protocol)) {
    throw new Error('E2E_BASE_URL must use HTTP(S)');
  }
  let state: SessionState;
  try {
    state = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as SessionState;
  } catch {
    throw new Error('E2E_AUTH_STORAGE_STATE_BASE64 must be a base64 Playwright storageState JSON');
  }
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
    throw new Error('Session state lacks a non-expired HttpOnly auth-tokens cookie for E2E_BASE_URL');
  }
  mkdirSync(join(process.cwd(), 'playwright', '.auth'), { recursive: true });
  writeFileSync(AUTH_STATE_PATH, JSON.stringify(state), { mode: 0o600 });
  // Never print the state, cookies or bearer credentials.
}
