// FR-STU-05 · FR-TCH-10 · BR-04: the student hands in their project (the last change included) and resubmits;
// the teacher sees it in the submissions list. Late, missing and refused cases are in the integration tests.
import { expect, test } from '@playwright/test';
import { pythonHomework } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.describe.configure({ mode: 'serial' });
let w: Awaited<ReturnType<typeof pythonHomework>>;
test.beforeAll(async () => {
  w = await pythonHomework();
});

test.describe('student', () => {
  test.use({ storageState: stateFile('student') });

  test('submits straight after typing, then submits again (the component test proves the last change is saved first)', async ({ page }) => {
    await page.goto(`/student/classes/${w.classId}/work/${w.workId}`);
    await expect(page.getByTestId('submit-state')).toHaveText(/^Not submitted yet\. Due \w{3} \d+ \w{3} \d{4}, 09:00\.$/);
    await page.getByRole('textbox', { name: 'Code for main.py' }).click();
    await page.keyboard.type('for i in range(1, 11):\n    print(7 * i)');
    await page.getByRole('button', { name: 'Submit', exact: true }).click(); // within the autosave pause
    await expect(page.getByRole('status').filter({ hasText: 'Submitted. Your teacher can see it now.' })).toBeVisible();
    await expect(page.getByTestId('submit-state')).toHaveText(/^Version 1 submitted .+\. You can submit again until .+\.$/);

    // M17b, F04: handing in the same work again is refused; after a change it's version 2.
    await page.getByRole('button', { name: 'Submit again' }).click();
    await expect(page.getByText('Nothing has changed since your last hand-in.')).toBeVisible();
    await page.getByRole('textbox', { name: 'Code for main.py' }).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\nprint("done")');
    await page.getByRole('button', { name: 'Submit again' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Submitted again (version 2).' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Versions you submitted' }).getByRole('listitem')).toHaveCount(2);
    await expectAccessible(page);
  });
});

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('sees who submitted, with versions; the others aren’t due yet', async ({ page }) => {
    await page.goto(`/teacher/classes/${w.classId}/work/${w.workId}`);
    const table = page.getByRole('table', { name: 'Submissions' });
    await expect(table.getByRole('row', { name: /Bopha Lim/ })).toContainText(/Submitted\w{3} \d+ \w{3} \d{4}, \d\d:\d\d2To mark$/);
    await expect(page.getByTestId('submission-counts')).toContainText('1 submitted0 late0 missing');
    await expect(table.getByRole('row', { name: /Borey Sam/ })).toContainText('Not due yet');
    await expectAccessible(page);
  });
});
