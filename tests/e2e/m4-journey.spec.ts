// M4 exit journey (docs/05): the teacher sets Java homework → the student writes a multi-file project, fixes the
// package warning and submits → the teacher opens it, downloads the .zip and marks it → the student sees the
// score and feedback. The Web half (the preview runs the student's script, the console shows console.log, and
// spike A's isolation tests against the real hostnames) is preview.spec.ts; paper scores are gradebook.spec.ts.
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { expect, test, type Browser } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { rehearsalClass, type TeachingClass } from './fixtures';
import { stateFile, USERS } from './global-setup';
import { expectAccessible } from './helpers';

test.describe.configure({ mode: 'serial' });
let c: TeachingClass;
const TITLE = 'Shapes in packages';
const as = async (browser: Browser, who: string) =>
  (await browser.newContext({ storageState: stateFile(who), baseURL: E2E.lms })).newPage();
test.beforeAll(async () => {
  c = await rehearsalClass();
});

test('the teacher sets Java homework for week 5', async ({ browser }) => {
  const page = await as(browser, 'teacher');
  await page.goto(`/teacher/classes/${c.classId}`);
  await page.getByRole('table', { name: 'Weeks' }).getByRole('link', { name: 'Week 5' }).click();
  await page.getByRole('link', { name: 'Classwork & homework' }).click();
  await page.getByRole('button', { name: 'Set new work' }).click();
  const dialog = page.getByRole('dialog', { name: 'Set new work' });
  await dialog.getByLabel('Language').selectOption('java');
  await dialog.getByLabel('Title').fill(TITLE);
  await dialog.getByLabel(/^Instructions/).fill('Add a `Circle` class in `src/shapes/` and print its area from `Main`.');
  await dialog.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('status')).toHaveText(`“${TITLE}” is published to the class.`);
  await page.context().close();
});

test('the student writes a two-file project, fixes the package warning, and submits', async ({ browser }) => {
  const page = await as(browser, 'student');
  await page.goto(`/student/classes/${c.classId}`);
  await page.getByRole('link', { name: TITLE }).click();
  await page.getByRole('button', { name: 'New file' }).click();
  await page.getByRole('form', { name: 'New file' }).getByLabel('File name').fill('src/shapes/Circle.java');
  await page.getByRole('form', { name: 'New file' }).getByRole('button', { name: 'Add' }).click();
  await page.getByRole('textbox', { name: 'Code for src/shapes/Circle.java' }).click();
  await page.keyboard.type('package shape;\n\npublic class Circle {\n');
  await page.getByRole('button', { name: 'Change to package shapes;' }).click();
  await expect(page.getByTestId('package-warning')).toBeHidden();
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Submitted. Your teacher can see it now.' })).toBeVisible();
  await page.context().close();
});

test('the teacher opens it, downloads the .zip, and marks it', async ({ browser }) => {
  const page = await as(browser, 'teacher');
  await page.goto(`/teacher/classes/${c.classId}/weeks/5/work`);
  await page.getByRole('table', { name: 'Work' }).getByRole('link', { name: TITLE }).click();
  await expect(page.getByTestId('submission-counts')).toContainText('1 to mark');
  await page.getByRole('table', { name: 'Submissions' }).getByRole('link', { name: USERS.student.name }).click();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .zip' }).click()]);
  const zip = unzipSync(new Uint8Array(await readFile((await download.path())!)));
  expect(Object.keys(zip).sort()).toEqual(['src/Main.java', 'src/shapes/Circle.java']);
  expect(strFromU8(zip['src/shapes/Circle.java']!)).toContain('package shapes;');

  await page.getByLabel('Score (out of 10)').fill('9');
  await page.getByLabel(`Feedback for ${USERS.student.name}`).fill('Good packages. Next: add a `getArea()` method.');
  await page.getByRole('button', { name: 'Save mark' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Mark saved.' })).toBeVisible();
  await expectAccessible(page);
  await page.context().close();
});

test('the student sees the score and feedback', async ({ browser }) => {
  const page = await as(browser, 'student');
  await page.goto(`/student/classes/${c.classId}`);
  await expect(page.getByRole('listitem').filter({ hasText: TITLE })).toContainText('Marked 9 / 10');
  await page.getByRole('link', { name: TITLE }).click();
  const mark = page.getByRole('region', { name: 'Your mark' });
  await expect(mark.getByTestId('score')).toHaveText('9 / 10');
  await expect(mark.locator('code')).toHaveText('getArea()');
  await expectAccessible(page);
  await page.context().close();
});
