import 'dotenv/config';
import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export const STORAGE_STATE_PATH = path.join(process.cwd(), 'storageState.json');

const GOOGLE_EMAIL = process.env.PLAYWRIGHT_GOOGLE_EMAIL ?? '';
const GOOGLE_PASSWORD = process.env.PLAYWRIGHT_GOOGLE_PASSWORD ?? '';

/** Maximum age of a cached storageState before re-login is needed (ms). */
const MAX_STATE_AGE_MS = 8 * 60 * 60 * 1000;

async function globalSetup(): Promise<void> {
  // CI: restore storageState from base64-encoded secret
  const encodedState = process.env.AUTH_STORAGE_STATE;
  if (encodedState) {
    console.log('[global-setup] Restoring storageState from AUTH_STORAGE_STATE env var');
    fs.writeFileSync(STORAGE_STATE_PATH, Buffer.from(encodedState, 'base64').toString('utf-8'));
    return;
  }

  // Reuse cached state if recent enough AND it contains real cookies
  if (fs.existsSync(STORAGE_STATE_PATH)) {
    const { mtimeMs } = fs.statSync(STORAGE_STATE_PATH);
    if (Date.now() - mtimeMs < MAX_STATE_AGE_MS) {
      const saved = JSON.parse(fs.readFileSync(STORAGE_STATE_PATH, 'utf-8'));
      if (Array.isArray(saved.cookies) && saved.cookies.length > 0) {
        const ageMin = Math.round((Date.now() - mtimeMs) / 60_000);
        console.log(`[global-setup] Reusing storageState (${ageMin}min old)`);
        return;
      }
      console.warn('[global-setup] Cached storageState has no cookies — re-running login.');
    }
  }

  // No credentials — write empty state so tests start with a clean session
  if (!GOOGLE_EMAIL || !GOOGLE_PASSWORD) {
    console.warn('[global-setup] No credentials set. Writing empty storageState.');
    fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  console.log('[global-setup] Logging in via Google OAuth with real Chrome...');

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  try {
    await page.goto('https://mentality-web.vercel.app');

    await Promise.any([
      page.getByRole('link', { name: /увійти/i }).click(),
      page.getByRole('link', { name: /login/i }).click(),
    ]);

    await page.waitForURL(/\/[a-z]{2}\/signin/, { timeout: 15_000 });

    await page.getByRole('button', { name: /signin with google/i }).click();
    await page.waitForURL(/accounts\.google\.com/, { timeout: 15_000 });

    await page.fill('input[type="email"]', GOOGLE_EMAIL);
    // Google uses either #identifierNext or a "Next" button depending on UX variant
    await page.locator('#identifierNext, button:has-text("Next")').first().click();

    await page.waitForSelector('input[type="password"]', { timeout: 30_000 });
    await page.fill('input[type="password"]', GOOGLE_PASSWORD);
    await page.locator('#passwordNext, button:has-text("Next")').first().click();

    // Google may show extra screens (consent, account picker, "Продовжити", etc.) — handle them.
    for (let attempt = 0; attempt < 8; attempt++) {
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
      if (!page.url().includes('accounts.google.com')) break;

      // Match any Google confirmation/continue button regardless of language
      const interstitialBtn = page.locator(
        '#confirm, ' +
          'button:has-text("Continue"), button:has-text("Allow"), ' +
          'button:has-text("Confirm"), button:has-text("Yes"), ' +
          'button:has-text("Продовжити"), button:has-text("Далі"), ' +
          'button:has-text("Дозволити"), ' +
          '[data-action="confirm"], [data-action="continue"]',
      );

      const visible = await interstitialBtn
        .first()
        .isVisible()
        .catch(() => false);
      if (visible) {
        console.log(
          `[global-setup] Handling Google interstitial (attempt ${attempt + 1}): ${page.url()}`,
        );
        await interstitialBtn.first().click();
        await page.waitForLoadState('domcontentloaded', { timeout: 10_000 });
      } else {
        // No known button visible — wait briefly for something to appear or for navigation away
        await page.waitForTimeout(1_500);
        if (!page.url().includes('accounts.google.com')) break;
      }
    }

    // Wait until we are back on the app AND not on the sign-in page.
    // Function predicate ensures we never settle on /signin (NextAuth error state).
    console.log('[global-setup] Waiting for authenticated redirect...');
    await page.waitForURL(
      (url) =>
        url.hostname.includes('mentality-web.vercel.app') && !url.pathname.includes('/signin'),
      { timeout: 60_000 },
    );
    await page.waitForLoadState('load', { timeout: 15_000 });

    const finalUrl = page.url();
    console.log(`[global-setup] Redirected to: ${finalUrl}`);

    const savedState = await context.storageState({ path: STORAGE_STATE_PATH });
    console.log(
      `[global-setup] Login successful. Saved storageState with ${savedState.cookies.length} cookies`,
    );
  } finally {
    await browser.close();
  }
}

export default globalSetup;
