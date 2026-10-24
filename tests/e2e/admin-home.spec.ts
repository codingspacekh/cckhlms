// FR-ADM-10 (M8): the admin dashboard in the approved design: a banner saying which week of the term it is, the
// headline numbers in one strip, what needs attention, this weekend, the classes and how students are doing.
import { expect, test } from '@playwright/test';
import { teachingClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.use({ storageState: stateFile('admin') });
test.beforeAll(async () => {
  await teachingClass(); // its term runs from three Saturdays ago, so today is in its week 4
});

test('the banner says which week of the term it is, with the weeks as puzzle pieces', async ({ page }) => {
  await page.goto('/admin');
  const banner = page.getByRole('region', { name: /^Term \d is in Week 4$/ });
  await expect(banner).toContainText(/weeks? to go/);
  await expect(banner.getByRole('img', { name: /^Weeks of Term \d · \d{4}: 3 gone by, week 4 now, \d+ to go$/ })).toBeVisible();
  await expect(banner.getByRole('link', { name: 'Add a person' })).toHaveAttribute('href', '/admin/people');
  await expectAccessible(page);
});

test('shows the numbers, what needs attention, this weekend, the classes and the score bands', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('region', { name: 'Term at a glance' })).toContainText('Active classes');
  await expect(page.getByRole('region', { name: 'Needs your attention' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'This weekend' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Running classes' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'How students are doing' })).toBeVisible();
});
