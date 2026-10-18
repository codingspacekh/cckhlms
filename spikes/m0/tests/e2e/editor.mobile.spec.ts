// Spike B (ADR-03): the editor works on a phone (touch + on-screen keyboard input).
import { expect, test } from '@playwright/test';

test('a student can tap into the editor and type on a phone', async ({ page }) => {
  await page.goto('/editor?project=python');
  await page.locator('.cm-content').tap();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nprint("from my phone")');
  await expect(page.locator('.cm-content')).toContainText('print("from my phone")');
});

test('the editor page fits the phone screen without sideways scrolling', async ({ page }) => {
  await page.goto('/editor?project=java');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
