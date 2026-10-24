// The club look (M8, approved 2026-10-24): the Champion Coders logo on the sign-in page and in the sidebar, the
// dark blue sidebar, Titillium Web for text.
import { expect, test, type Page } from '@playwright/test';
import { stateFile } from './global-setup';

const bodyFont = (page: Page) => page.evaluate(() => getComputedStyle(document.body).fontFamily);

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the sign-in page shows the club logo', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('img', { name: 'Champion Coders' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    expect(await bodyFont(page)).toMatch(/titillium/i);
  });
});

test.describe('signed in', () => {
  test.use({ storageState: stateFile('student'), colorScheme: 'light' });

  test('the sidebar is dark blue with the logo, and text is in Titillium Web', async ({ page }) => {
    await page.goto('/student');
    const side = page.locator('aside.side');
    await expect(side.getByRole('img', { name: 'Champion Coders' })).toBeVisible();
    expect(await side.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(21, 42, 92)');
    expect(await bodyFont(page)).toMatch(/titillium/i);
    // the font file itself loaded (not just named)
    await expect
      .poll(() => page.evaluate(() => [...document.fonts].some((f) => /titillium/i.test(f.family) && f.status === 'loaded')))
      .toBe(true);
  });
});
