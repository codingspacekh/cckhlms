// FR-STU-07: the student's My progress page: a tile per class with their current standing, their scores by task,
// and axe in light and dark mode. The numbers are covered by the integration tests.
import { expect, test } from '@playwright/test';
import { reportsClass, type TeachingClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

let c: TeachingClass;
test.beforeAll(async () => {
  c = await reportsClass(); // Bopha's exam: 72.5
});
test.use({ storageState: stateFile('student') });

test('shows my standing in each class and my scores by task', async ({ page }) => {
  await page.goto('/student');
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'My progress' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'My progress' })).toBeVisible();
  const tile = page.getByRole('region', { name: c.className });
  await expect(tile.getByRole('img', { name: '72.5 out of 100, pass mark 60' })).toBeVisible();
  const chart = page.getByRole('region', { name: 'Python Reports: my scores by task' });
  await chart.getByRole('button', { name: 'Table' }).click();
  await expect(chart.getByRole('row', { name: /End-term exam 72.5%/ })).toBeVisible();
  await expectAccessible(page);
});

test('passes axe in dark mode too', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/student/progress');
  await expect(page.getByRole('heading', { level: 1, name: 'My progress' })).toBeVisible();
  await expectAccessible(page);
});
