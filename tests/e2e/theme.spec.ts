// Readability (owner, 2026-10-23): the top bar switch picks light or dark; the pick outlasts a reload and wins
// over the device's setting.
import { expect, test, type Page } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { stateFile } from './global-setup';

test.use({ storageState: stateFile('student'), colorScheme: 'light' });

const picked = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme ?? null);
const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('the switch turns the dark theme on and off, and remembers it', async ({ page }) => {
  await page.goto('/student');
  const light = await background(page);
  expect(await picked(page)).toBeNull();

  await page.getByRole('button', { name: 'Switch to the dark theme' }).click();
  expect(await picked(page)).toBe('dark');
  await expect.poll(() => background(page)).not.toBe(light);
  const dark = await background(page);

  await page.reload();
  expect(await picked(page)).toBe('dark'); // rendered by the server from the cookie
  expect(await background(page)).toBe(dark);

  await page.getByRole('button', { name: 'Switch to the light theme' }).click();
  await expect.poll(() => background(page)).toBe(light);
});

test('a light theme picked with the switch wins over a dark device', async ({ page, context }) => {
  await context.addCookies([{ name: 'theme', value: 'light', url: E2E.lms }]);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/student');
  expect(await picked(page)).toBe('light');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).not.toBe('dark');
  await expect(page.getByRole('button', { name: 'Switch to the dark theme' })).toBeVisible();
});
