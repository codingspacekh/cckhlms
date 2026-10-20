// FR-TCH-11 · FR-TCH-12 · FR-STU-06 · BR-04: the teacher opens a student's work read-only, downloads it as a
// .zip, returns it for a redo; the student resubmits; the teacher marks the new version and moves on to the
// next student; the student sees the mark and feedback. Score rules and permissions are in the integration tests.
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { expect, test } from '@playwright/test';
import { CLASSMATE, gradingHomework, handIn } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.describe.configure({ mode: 'serial' });
let w: Awaited<ReturnType<typeof gradingHomework>>;
test.beforeAll(async () => {
  w = await gradingHomework();
  await handIn(w.workId, 'Bopha Lim', [{ path: 'main.py', content: 'for i in range(10, 0, -1):\n    print(i)' }]);
  await handIn(w.workId, CLASSMATE, [{ path: 'main.py', content: 'print(10)' }]);
});

test.describe('teacher returns it', () => {
  test.use({ storageState: stateFile('teacher') });

  test('opens Bopha’s work from the list, reads it, downloads it, and returns it for a redo', async ({ page }) => {
    await page.goto(`/teacher/classes/${w.classId}/work/${w.workId}`);
    await expect(page.getByTestId('submission-counts')).toContainText('2 to mark');
    await page.getByRole('table', { name: 'Submissions' }).getByRole('link', { name: 'Bopha Lim' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Bopha Lim' })).toBeVisible();
    const code = page.getByRole('textbox', { name: 'Code for main.py' });
    await expect(code).toContainText('range(10, 0, -1)');
    await expect(code).toHaveAttribute('contenteditable', 'false');
    await expect(page.getByLabel('Upload files or .zip')).toHaveCount(0);

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .zip' }).click()]);
    expect(download.suggestedFilename()).toBe('countdown-bopha.l-v1.zip');
    const zip = unzipSync(new Uint8Array(await readFile((await download.path())!)));
    expect(strFromU8(zip['main.py']!)).toContain('range(10, 0, -1)');

    await page.getByLabel('Feedback for Bopha Lim').fill('It stops at 1. Count down **to 0**.');
    await page.getByRole('button', { name: 'Return for redo' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Returned for a redo.' })).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe('student redoes it', () => {
  test.use({ storageState: stateFile('student') });

  test('sees the teacher’s note and hands it in again', async ({ page }) => {
    await page.goto(`/student/classes/${w.classId}`);
    await expect(page.getByRole('listitem').filter({ hasText: 'Countdown' })).toContainText('Returned for redo');
    await page.getByRole('link', { name: 'Countdown' }).click();
    const note = page.getByRole('region', { name: 'Returned for a redo' });
    await expect(note).toContainText('Count down to 0.');
    await expect(note.locator('strong')).toHaveText('to 0');
    await page.getByRole('textbox', { name: 'Code for main.py' }).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('for i in range(10, -1, -1):\n    print(i)');
    await page.getByRole('button', { name: 'Submit again' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Submitted again (version 2).' })).toBeVisible();
  });
});

test.describe('teacher marks it', () => {
  test.use({ storageState: stateFile('teacher') });

  test('marks the new version, sees the old one as history, and moves on to the next student', async ({ page }) => {
    await page.goto(`/teacher/classes/${w.classId}/work/${w.workId}`);
    await page.getByRole('table', { name: 'Submissions' }).getByRole('link', { name: 'Bopha Lim' }).click();
    const versions = page.getByRole('navigation', { name: 'Versions' });
    await expect(versions.getByRole('link', { name: 'Version 2 (latest)' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('textbox', { name: 'Code for main.py' })).toContainText('range(10, -1, -1)');

    await versions.getByRole('link', { name: 'Version 1' }).click();
    await expect(page.getByRole('textbox', { name: 'Code for main.py' })).toContainText('range(10, 0, -1)');
    await expect(page.getByRole('region', { name: 'Version 1’s mark' })).toContainText('Returned for a redo');
    await page.getByRole('link', { name: 'Mark version 2' }).click();

    await page.getByLabel('Score (out of 10)').fill('8.5');
    await page.getByLabel('Feedback for Bopha Lim').fill('Now it reaches 0. Well done!');
    await page.getByRole('button', { name: 'Save mark' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Mark saved.' })).toBeVisible();
    await expectAccessible(page);

    await page
      .getByRole('navigation', { name: 'Other students' })
      .getByRole('link', { name: `${CLASSMATE} →` })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: CLASSMATE })).toBeVisible();
    await page.getByLabel('Score (out of 10)').fill('5');
    await page.getByRole('button', { name: 'Save mark' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Mark saved.' })).toBeVisible();

    await page.goto(`/teacher/classes/${w.classId}/work/${w.workId}`);
    const table = page.getByRole('table', { name: 'Submissions' });
    await expect(table.getByRole('row', { name: /Bopha Lim/ })).toContainText('8.5 / 10');
    await expect(table.getByRole('row', { name: new RegExp(CLASSMATE) })).toContainText('5 / 10');
    await expect(page.getByTestId('submission-counts')).not.toContainText('to mark');
  });
});

test.describe('student sees the mark', () => {
  test.use({ storageState: stateFile('student') });

  test('sees the score and feedback, and can’t change it now', async ({ page }) => {
    await page.goto(`/student/classes/${w.classId}`);
    await expect(page.getByRole('listitem').filter({ hasText: 'Countdown' })).toContainText('Marked 8.5 / 10');
    await page.getByRole('link', { name: 'Countdown' }).click();
    const mark = page.getByRole('region', { name: 'Your mark' });
    await expect(mark.getByTestId('score')).toHaveText('8.5 / 10');
    await expect(mark).toContainText('Now it reaches 0. Well done!');
    await expect(page.getByRole('button', { name: 'Submit again' })).toBeDisabled();
    await expect(page.getByText('Your teacher has marked this, so it can’t be changed.')).toBeVisible();
    await expectAccessible(page);
  });
});
