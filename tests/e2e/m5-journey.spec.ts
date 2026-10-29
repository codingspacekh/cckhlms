// M5 exit journey (docs/05): the teacher checks the class's statistics and finalises the term reports (one result
// confirmed, one student flagged as needing support) → the admin dashboard shows the support flag and the admin's
// student report shows the published report → the student's My progress shows their published report. The
// numbers themselves are checked by the golden table and the integration tests.
import { expect, test, type Browser } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { CLASSMATE, journeyClass, type TeachingClass } from './fixtures';
import { stateFile, USERS } from './global-setup';
import { choose, expectAccessible } from './helpers';

test.describe.configure({ mode: 'serial' });
let c: TeachingClass;
const as = async (browser: Browser, who: string) =>
  (await browser.newContext({ storageState: stateFile(who), baseURL: E2E.lms })).newPage();
test.beforeAll(async () => {
  c = await journeyClass(); // exam: Bopha Lim 72.5, Borey Sam 55
});

test('the teacher checks the statistics and finalises the term reports', async ({ browser }) => {
  const page = await as(browser, 'teacher');
  await page.goto(`/teacher/classes/${c.classId}/stats`);
  await expect(page.getByRole('img', { name: '63.8 out of 100, pass mark 60' })).toBeVisible(); // (72.5 + 55) / 2

  await page
    .getByRole('group', { name: `${c.className} sections` })
    .getByRole('link', { name: 'Term reports' })
    .click();
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: `Write report for ${USERS.student.name}` }).click();
  await choose(dialog.getByLabel('Rating'), 'excellent');
  await dialog.getByLabel('Comment').fill('A pleasure to teach. Ready for Level 2.');
  await dialog.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toHaveText(`Report saved for ${USERS.student.name}.`);

  await page.getByRole('button', { name: `Write report for ${CLASSMATE}` }).click();
  await expect(dialog.getByLabel('Result')).toHaveAttribute('value', 'fail');
  await choose(dialog.getByLabel('Rating'), 'needs_work');
  await dialog.getByLabel('Needs support').check();
  await dialog.getByLabel('What support?').fill('Practise loops at home before repeating Level 1');
  await dialog.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('status')).toHaveText(`Report saved for ${CLASSMATE}.`);

  await page.getByRole('button', { name: 'Publish reports' }).click();
  await dialog.getByRole('button', { name: 'Publish 2 reports' }).click();
  await expect(page.getByRole('status')).toHaveText('2 reports published.');
  await page.context().close();
});

test('the admin dashboard flags the student who needs support, and the student report shows it', async ({ browser }) => {
  const page = await as(browser, 'admin');
  await page.goto('/admin');
  const attention = page.getByRole('region', { name: 'Needs your attention' });
  await expect(attention).toContainText('Practise loops at home before repeating Level 1');
  await expectAccessible(page);
  await attention.getByRole('link', { name: `Open report for ${CLASSMATE}` }).click();
  await expect(page.getByRole('heading', { level: 1, name: CLASSMATE })).toBeVisible();
  const report = page.getByRole('region', { name: `Term report: ${c.className}` });
  await expect(report).toContainText('Published');
  await expect(report).toContainText('Needs work · Fail · final 55.0');
  await expect(report).toContainText('Needs support. Practise loops at home before repeating Level 1');
  await expectAccessible(page);
  await page.context().close();
});

test('the student sees their published report on My progress', async ({ browser }) => {
  const page = await as(browser, 'student');
  await page.goto('/student/progress');
  const reports = page.getByRole('table', { name: 'My term reports' });
  await expect(reports.getByRole('row', { name: new RegExp(c.className) })).toContainText(
    '72.5PassExcellentA pleasure to teach. Ready for Level 2.',
  );
  await page.context().close();
});
