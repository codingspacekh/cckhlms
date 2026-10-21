// FR-SYS-01 · FR-STU-09: the bell says how many notifications are new; the page lists them as links and, once
// opened, they are read.
import { expect, test } from '@playwright/test';
import { dueSoonWork } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.describe('student', () => {
  test.use({ storageState: stateFile('student') });

  test('sees new work and work due soon from the bell, and they are read once seen', async ({ page }) => {
    const w = await dueSoonWork();
    await page.goto('/student');
    await page.getByRole('link', { name: /^Notifications, \d+ new$/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    await expectAccessible(page);
    const due = page.getByRole('listitem').filter({ hasText: `Due soon: ${w.title}` });
    await expect(due.getByText('New', { exact: true })).toBeVisible();
    await expect(due).toContainText('Python Teaching · Sat 09:00');
    await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible(); // read now, so the bell clears

    await page.getByRole('link', { name: `New homework: ${w.title}` }).click();
    await expect(page.getByRole('heading', { level: 1, name: w.title })).toBeVisible();

    await page.goto('/student/notifications');
    await expect(
      page
        .getByRole('listitem')
        .filter({ hasText: `Due soon: ${w.title}` })
        .getByText('New', { exact: true }),
    ).toHaveCount(0);
  });
});

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('has a notifications page too', async ({ page }) => {
    await page.goto('/teacher');
    await page.getByRole('link', { name: /^Notifications/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    await expectAccessible(page);
  });
});
