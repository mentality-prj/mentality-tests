import { expect, test } from '@playwright/test';

test('authenticated mobile pages render without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/en/my-day', '/en/mood-tracker']) {
    const navigation = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(navigation?.status(), path).toBe(200);
    await expect(page).toHaveURL(new RegExp(path + '$'));
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(8);
  }
});

test('protected SSR survives locale navigation and hard reload', async ({ page }) => {
  for (const locale of ['en', 'uk', 'pl']) {
    const target = '/' + locale + '/my-day';
    const response = await page.goto(target, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), target).toBe(200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp('\\/' + locale + '\\/my-day(?:\\?.*)?$'));
    const session = await page.request.get('/api/auth/session');
    expect(session.status()).toBe(200);
  }
});
