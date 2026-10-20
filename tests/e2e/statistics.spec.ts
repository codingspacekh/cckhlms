// FR-TCH-18: the teacher's Statistics tab: tiles and charts from the class's marks and attendance, each chart with
// a table view, and axe passing in light and dark mode. The numbers are covered by the integration tests; this
// class (the reports fixture) has one exam marked: 72.5 and 55.
import { expect, test } from '@playwright/test';
import { reportsClass, type TeachingClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

let c: TeachingClass;
test.beforeAll(async () => {
  c = await reportsClass();
});
test.use({ storageState: stateFile('teacher') });

test('shows the class’s statistics, with a table view for each chart', async ({ page }) => {
  await page.goto(`/teacher/classes/${c.classId}`);
  await page
    .getByRole('group', { name: `${c.className} sections` })
    .getByRole('link', { name: 'Statistics' })
    .click();
  await expect(page.getByText('Class average', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('img', { name: '63.8 out of 100, pass mark 60' })).toBeVisible(); // (72.5 + 55) / 2
  await expect(page.getByText('No attendance taken yet.')).toBeVisible();

  const spread = page.getByRole('region', { name: 'Spread of current standings' });
  await spread.getByRole('img', { name: '50–59 points: 1' }).hover();
  await expect(spread.getByRole('tooltip')).toContainText('1Students');
  await spread.getByRole('button', { name: 'Table' }).click();
  await expect(spread.getByRole('row', { name: '70–79 points 1' })).toBeVisible();

  const tasks = page.getByRole('region', { name: 'Average score by task' });
  await expect(tasks).toContainText('End-term exam');
  await expect(tasks).toContainText('63.8%');
  await expectAccessible(page);
});

test('passes axe in dark mode too', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`/teacher/classes/${c.classId}/stats`);
  await expect(page.getByText('Class average', { exact: true }).first()).toBeVisible();
  await expectAccessible(page);
});
