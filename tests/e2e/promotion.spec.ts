// FR-ADM-13 · FR-ADM-14 · BR-07: Admin promotes a class at the end of term; it is archived, and its teacher can
// still open it from Past classes but not change it.
import { expect, test } from '@playwright/test';
import { promotionClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.describe.configure({ mode: 'serial' });
let c: Awaited<ReturnType<typeof promotionClass>>;
test.beforeAll(async () => {
  c = await promotionClass();
});

test.describe('admin', () => {
  test.use({ storageState: stateFile('admin') });

  test('promotes the class: the passed student to the next level, the other to a repeat class', async ({ page }) => {
    await page.goto('/admin/promotion');
    await expectAccessible(page);
    const row = page.getByRole('row', { name: new RegExp(c.className) });
    await expect(row).toContainText('2 of 2');
    await expect(row).toContainText('Ready');
    await row.getByRole('link', { name: 'Open wizard' }).click();

    await expect(page.getByRole('heading', { level: 1, name: `Promote ${c.className}` })).toBeVisible();
    await expectAccessible(page);
    await page.getByLabel('Passed (1) move to', { exact: true }).selectOption({ label: c.next });
    await page.getByLabel('Not passed (1) move to', { exact: true }).selectOption({ label: c.repeat });
    const students = page.getByRole('table');
    await expect(students.getByRole('row', { name: /Nita Ung/ })).toContainText('Pass');
    await expect(page.getByLabel('Next class for Nita Ung').locator('option:checked')).toHaveText(c.next);
    await expect(page.getByLabel('Next class for Pich Ros').locator('option:checked')).toHaveText(c.repeat);

    await page.getByRole('button', { name: 'Confirm promotion' }).click();
    await expect(page.getByRole('status')).toHaveText('Done: 2 students moved on. The class is archived.');

    await page.goto(`/admin/classes/${c.classId}`);
    await expect(page.getByRole('note')).toContainText('Archived.');
    await expect(page.getByRole('link', { name: 'Promote' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Nita Ung/ })).toContainText('Finished');
  });
});

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('opens the archived class from Past classes and sees it can only be looked at', async ({ page }) => {
    await page.goto('/teacher');
    await page.getByRole('region', { name: 'Past classes' }).getByRole('link', { name: c.className }).click();
    await expect(page.getByRole('note')).toHaveText(/^Archived\. .* has ended, so this class can be looked at but not changed\.$/);
    await page.goto(`/teacher/classes/${c.classId}/students`);
    await expect(page.getByRole('note')).toContainText('Archived.');
  });
});
