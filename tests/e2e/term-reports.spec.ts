// FR-TCH-15/16/17 · BR-08 · BR-13: the teacher writes the class's term reports, confirming or overriding (with a
// reason) the suggested result, and publishes them; Admin sees them and may change a published one. The rules
// behind it are covered by the unit and integration tests.
import { expect, test } from '@playwright/test';
import { CLASSMATE, reportsClass, type TeachingClass } from './fixtures';
import { stateFile, USERS } from './global-setup';
import { expectAccessible } from './helpers';

test.describe.configure({ mode: 'serial' });
let c: TeachingClass;
test.beforeAll(async () => {
  c = await reportsClass();
});

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('writes each report, overrides one result with a reason, and publishes them', async ({ page }) => {
    await page.goto(`/teacher/classes/${c.classId}`);
    await page
      .getByRole('group', { name: `${c.className} sections` })
      .getByRole('link', { name: 'Term reports' })
      .click();
    const table = page.getByRole('table', { name: 'Term reports' });
    await expect(table.getByRole('row', { name: new RegExp(USERS.student.name) })).toContainText('72.5Pass');
    await expect(table.getByRole('row', { name: new RegExp(CLASSMATE) })).toContainText('55.0Fail');
    await expectAccessible(page);

    // The suggested result is chosen to start with.
    await page.getByRole('button', { name: `Write report for ${USERS.student.name}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Result')).toHaveValue('pass');
    await dialog.getByLabel('Rating').selectOption('good');
    await dialog.getByLabel('Comment').fill('Helps others in Q&A. Ready for Level 2.');
    await dialog.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('status')).toHaveText(`Report saved for ${USERS.student.name}.`);

    // Overriding the suggestion needs a reason; an error keeps what was typed.
    await page.getByRole('button', { name: `Write report for ${CLASSMATE}` }).click();
    await dialog.getByLabel('Rating').selectOption('developing');
    await dialog.getByLabel('Result').selectOption('pass');
    await expect(dialog.getByText('The score suggests Fail.')).toBeVisible();
    await dialog.getByLabel('Comment').fill('Much stronger in class than in the exam.');
    await dialog.getByRole('button', { name: 'Save draft' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('The score suggests Fail. Write why the result is Pass.');
    await expect(dialog.getByLabel('Comment')).toHaveValue('Much stronger in class than in the exam.');
    await dialog.getByLabel(/Reason for the change/).fill('Strong practical work all term');
    await dialog.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('status')).toHaveText(`Report saved for ${CLASSMATE}.`);
    await expect(table.getByRole('row', { name: new RegExp(CLASSMATE) })).toContainText('PassNot suggested');

    await page.getByRole('button', { name: 'Publish reports' }).click();
    await dialog.getByRole('button', { name: 'Publish 2 reports' }).click();
    await expect(page.getByRole('status')).toHaveText('2 reports published.');
    await expect(table.getByRole('row', { name: new RegExp(USERS.student.name) })).toContainText('Published');
    await expect(page.getByRole('button', { name: 'Publish reports' })).toHaveCount(0);
    await expectAccessible(page);
  });
});

test.describe('admin', () => {
  test.use({ storageState: stateFile('admin') });

  test('sees the published reports from the class page and may change one, saying why (BR-08)', async ({ page }) => {
    await page.goto(`/admin/classes/${c.classId}`);
    await page.getByRole('link', { name: 'Term reports' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Term reports' })).toBeVisible();
    await page.getByRole('button', { name: `Change report for ${CLASSMATE}` }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Why are you changing a published report?')).toBeVisible();
    await dialog.getByLabel('Why are you changing a published report?').fill('Agreed with the lead teacher');
    await dialog.getByRole('button', { name: 'Save change' }).click();
    await expect(page.getByRole('status')).toHaveText(`Report saved for ${CLASSMATE}.`);
    await expectAccessible(page);
  });
});
