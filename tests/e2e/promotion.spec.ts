// FR-ADM-13 · FR-ADM-14 · BR-07: Admin promotes a class at the end of term; it is archived, and its teacher can
// still open it from Past classes but not change it.
import { expect, test } from '@playwright/test';
import { termEndClass } from './fixtures';
import { stateFile } from './global-setup';
import { choose, expectAccessible } from './helpers';

test.describe.configure({ mode: 'serial' });
let c: Awaited<ReturnType<typeof termEndClass>>;
test.beforeAll(async () => {
  c = await termEndClass();
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
    await choose(page.getByLabel('Passed (1) move to', { exact: true }), { label: c.next });
    await choose(page.getByLabel('Not passed (1) move to', { exact: true }), { label: c.repeat });
    const students = page.getByRole('table');
    await expect(students.getByRole('row', { name: /Nita Ung/ })).toContainText('Pass');
    await expect(page.getByLabel('Next class for Nita Ung')).toHaveText(c.next);
    await expect(page.getByLabel('Next class for Pich Ros')).toHaveText(c.repeat);
    // M15a: the repeat class has 1 place and someone in it already. A warning, not a block.
    await expect(page.getByText('2 of 1 places after this')).toBeVisible();
    await expect(page.getByRole('note', { name: 'Check before you confirm' })).toContainText(
      `${c.repeat}: 2 of 1 places, 1 over its capacity.`,
    );
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Confirm promotion' }).click();
    await expect(page.getByRole('status')).toHaveText('Done: 2 students moved on. The class is archived.');

    await page.goto(`/admin/classes/${c.classId}`);
    await expect(page.getByRole('note')).toHaveText(
      /^Archived\. Promoted on \w{3} \d{1,2} \w{3} \d{4} by .+: 2 moved on\. This class can be looked at but not changed\.$/,
    );
    await expect(page.getByRole('link', { name: 'Promote' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Withdraw' })).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Nita Ung/ })).toContainText('Finished');
  });

  test('M15b: undoes the promotion before the new classes start, then promotes again', async ({ page }) => {
    await page.goto('/admin/promotion');
    await page
      .getByRole('row', { name: new RegExp(c.className) })
      .getByRole('link', { name: /^Undo until / })
      .click();
    const card = page.getByRole('region', { name: 'Made a mistake?' });
    await expect(card).toContainText(`when ${c.next} starts`);
    await card.getByRole('button', { name: 'Undo promotion…' }).click();
    const dialog = page.getByRole('dialog', { name: `Undo the promotion of ${c.className}?` });
    await expect(dialog).toContainText('The 2 students are back in this class, as before.');
    await expectAccessible(page);
    await dialog.getByRole('button', { name: 'Undo promotion' }).click();

    await expect(page.getByRole('status')).toHaveText(
      'Promotion undone: every student is back in this class, which can be promoted again.',
    );
    await expect(page.getByRole('row', { name: /Nita Ung/ })).not.toContainText('Finished');
    await expect(page.getByText('Archived.')).toHaveCount(0);

    // Promoted again, as before, so the teacher's checks below still hold.
    await page.getByRole('link', { name: 'Promote', exact: true }).click();
    await choose(page.getByLabel('Passed (1) move to', { exact: true }), { label: c.next });
    await choose(page.getByLabel('Not passed (1) move to', { exact: true }), { label: c.repeat });
    await page.getByRole('button', { name: 'Confirm promotion' }).click();
    await expect(page.getByRole('status')).toHaveText('Done: 2 students moved on. The class is archived.');
  });
});

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('opens the archived class from Past classes and sees it can only be looked at', async ({ page }) => {
    await page.goto('/teacher');
    await page.getByRole('region', { name: 'Past classes' }).getByRole('link', { name: c.className }).click();
    await expect(page.getByRole('note')).toHaveText(
      /^Archived\. Promoted on .+: 2 moved on\. This class can be looked at but not changed\.$/,
    );
    await page.goto(`/teacher/classes/${c.classId}/students`);
    await expect(page.getByRole('note')).toContainText('Archived.');
  });
});
