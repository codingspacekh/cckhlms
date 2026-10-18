// NFR-08: the dashboard shell works at phone width.
import { expect, test } from '@playwright/test';
import { stateFile } from './global-setup';

test.use({ storageState: stateFile('student') });

test('the shell fits a phone screen: navigation and sign-out are reachable, no sideways scrolling', async ({ page }) => {
  await page.goto('/student');
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
