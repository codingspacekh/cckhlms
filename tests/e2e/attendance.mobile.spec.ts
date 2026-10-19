// FR-TCH-06: on a phone, attendance is one tap per change and fits the screen.
import { expect, test } from '@playwright/test';
import { teachingClass } from './fixtures';
import { stateFile } from './global-setup';

test.use({ storageState: stateFile('teacher') });

test('takes week 1’s attendance by touch, one tap per change', async ({ page }) => {
  const c = await teachingClass();
  await page.goto(`/teacher/classes/${c.classId}/weeks/1/attendance`);
  const sheet = page.getByRole('table', { name: 'Attendance' });
  await sheet.getByRole('radiogroup', { name: c.students[1] }).getByText('Absent').tap();
  await expect(page.getByRole('status', { name: 'Attendance saved' })).toContainText(`${c.students[1]} is absent`);
  await sheet.getByRole('radiogroup', { name: c.students[3] }).getByText('Late').tap();
  await expect(page.getByTestId('attendance-counts')).toHaveText('13 present · 1 late · 1 absent · 0 excused');
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(scroll).toBeLessThanOrEqual(0);

  await page.reload();
  await expect(
    page.getByRole('table', { name: 'Attendance' }).getByRole('radiogroup', { name: c.students[1] }).getByRole('radio', { name: 'Absent' }),
  ).toBeChecked();
});
