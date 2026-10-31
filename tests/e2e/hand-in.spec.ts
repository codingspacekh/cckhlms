// M18b · BR-32 · FR-STU-05 · FR-TCH-11 (prototype screens 4–5): a student hands in a Scratch project as an .sb3 file,
// then a link to it; the teacher downloads the file, opens the link and marks it. The rules are in the integration tests.
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { scratchHomework } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.describe.configure({ mode: 'serial' });
let w: Awaited<ReturnType<typeof scratchHomework>>;
const project = Buffer.from('PK\u0003\u0004 a pretend Scratch project for the e2e test');
test.beforeAll(async () => {
  w = await scratchHomework();
});

test.describe('student', () => {
  test.use({ storageState: stateFile('student') });

  test('hands in the .sb3 file, then the link to the shared project', async ({ page }) => {
    await page.goto(`/student/classes/${w.classId}/work/${w.workId}`);
    await expect(page.getByTestId('submit-state')).toHaveText(/^Not handed in yet\./);
    await expectAccessible(page);
    await page
      .getByLabel('Your Scratch file')
      .setInputFiles({ name: 'maze game.sb3', mimeType: 'application/octet-stream', buffer: project });
    await expect(page.getByText('maze game.sb3')).toBeVisible();
    await page.getByRole('button', { name: 'Hand in' }).click();
    await expect(page.getByRole('status')).toHaveText('Handed in (version 1). Your teacher can see it now.');
    await expect(page.getByRole('list', { name: 'Versions you handed in' }).getByRole('link', { name: 'maze game.sb3' })).toBeVisible();

    await page.getByLabel('Link to your shared project').fill('http://scratch.mit.edu/projects/1093824551');
    await page.getByRole('button', { name: 'Hand in' }).click();
    const box = page.getByRole('region', { name: 'Hand in your project' });
    await expect(box.getByRole('alert')).toHaveText('Use a link that starts with https://scratch.mit.edu/');
    await page.getByLabel('Link to your shared project').fill('https://scratch.mit.edu/projects/1093824551');
    await page.getByRole('button', { name: 'Hand in' }).click();
    await expect(page.getByRole('status')).toHaveText('Handed in (version 2). Your teacher can see it now.');
    await expect(page.getByRole('list', { name: 'Versions you handed in' }).getByRole('listitem')).toHaveCount(2);
    await expectAccessible(page);
  });
});

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('downloads the file, opens the link and marks it', async ({ page }) => {
    await page.goto(`/teacher/classes/${w.classId}/work/${w.workId}`);
    await page.getByRole('table', { name: 'Submissions' }).getByRole('link', { name: 'Bopha Lim' }).click();
    await expect(page.getByRole('link', { name: 'Open https://scratch.mit.edu/projects/1093824551' })).toHaveAttribute(
      'href',
      'https://scratch.mit.edu/projects/1093824551',
    );
    await page.getByRole('navigation', { name: 'Versions' }).getByRole('link', { name: 'Version 1' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Download maze game.sb3' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('maze game.sb3');
    expect(await readFile((await download.path())!)).toEqual(project);
    await expectAccessible(page);

    await page
      .getByRole('navigation', { name: 'Versions' })
      .getByRole('link', { name: /Version 2/ })
      .click();
    await page.getByLabel('Score (out of 10)').fill('8.5');
    await page.getByLabel('Feedback for Bopha Lim').fill('The timer works well!');
    await page.getByRole('button', { name: 'Save mark' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Mark saved.' })).toBeVisible();
  });
});
