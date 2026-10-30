// M14b · FR-TCH-14, FR-ADM-17, BR-27: a teacher fills a week's report sheet from the keyboard, and Admin reads it on
// Weekly reports with the students who need support.
import { expect, test } from '@playwright/test';
import { sheetClass } from './fixtures';
import { stateFile } from './global-setup';
import { choose, expectAccessible } from './helpers';

let classId = '';
let className = '';
let termName = '';

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ classId, className, termName } = await sheetClass());
});

test.describe('the teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('fills week 2’s sheet: attendance, comments by keyboard, participation and a support flag', async ({ page }) => {
    await page.goto(`/teacher/classes/${classId}/weeks/2/report`);
    const sheet = page.getByRole('table', { name: 'Weekly report, one row per student' });
    await expect(sheet.getByText('Take attendance first')).toHaveCount(3);
    await expectAccessible(page);

    await choose(sheet.getByLabel('Attendance, Sothea Kem'), 'absent'); // the others are saved as present
    await expect(sheet.getByLabel('Attendance, Leakena Som')).toContainText('Present');
    await expect(page.getByRole('status')).toContainText('All changes saved');

    await sheet.getByLabel('Teacher comment, Leakena Som').fill('Finished both exercises.');
    await page.keyboard.press('Enter');
    await expect(sheet.getByLabel('Teacher comment, Rotanak Ry')).toBeFocused();
    await page.keyboard.type('Quiet today.');
    await page.keyboard.press('ArrowUp');
    await expect(sheet.getByLabel('Teacher comment, Leakena Som')).toBeFocused();

    await page.getByRole('button', { name: 'Mark everyone here as active' }).click();
    await expect(sheet.getByLabel('Participation, Rotanak Ry')).toContainText('Active');
    await choose(sheet.getByLabel('Participation, Rotanak Ry'), 'not_active');
    await choose(sheet.getByLabel('Needs support, Sothea Kem'), 'yes');
    await sheet.getByLabel('Note for admin, Sothea Kem').fill('Missed two weeks. Can admin call home?');
    await sheet.getByLabel('Note for admin, Sothea Kem').blur();
    await expect(page.getByRole('status')).toContainText('All changes saved');
    await expect(page.getByTestId('sheet-totals')).toHaveText(/2 of 3 here.*1 of 2 active.*1 need support.*2 comments written/);

    // The attendance tab shows the same record.
    await page.goto(`/teacher/classes/${classId}/weeks/2/attendance`);
    await expect(page.getByRole('radiogroup', { name: 'Sothea Kem' }).getByRole('radio', { name: 'Absent' })).toBeChecked();
    await page.goto(`/teacher/classes/${classId}/weeks/2/report`);
    await expect(page.getByLabel('Teacher comment, Rotanak Ry')).toHaveValue('Quiet today.');
    await expectAccessible(page);
  });
});

test.describe('Admin', () => {
  test.use({ storageState: stateFile('admin') });

  test('reads it on Weekly reports, with who needs support', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('navigation').getByRole('link', { name: 'Weekly reports' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Weekly reports' })).toBeVisible();
    await choose(page.getByRole('combobox', { name: 'Term' }), { label: termName });
    await choose(page.getByRole('combobox', { name: 'Week' }), '2');
    const row = page.getByRole('row', { name: new RegExp(className) });
    await expect(row).toContainText('2 of 3');
    await expect(row).toContainText('Written');
    const support = page.getByRole('region', { name: 'Needs support this week' });
    await expect(support).toContainText('Sothea Kem');
    await expect(support).toContainText('Missed two weeks. Can admin call home?');
    await expectAccessible(page);

    await row.getByRole('link', { name: 'Open' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Python Sheet · Week 2');
    const sheet = page.getByRole('table', { name: 'Weekly report, read only' });
    await expect(sheet.getByRole('row', { name: /Leakena Som/ })).toContainText('Finished both exercises.');
    await expect(sheet.getByRole('row', { name: /Sothea Kem/ })).toContainText('Absent');
    await expect(sheet.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Week 1/ })).toBeVisible();
    await expectAccessible(page);
  });
});
