// FR-TCH-06 · BR-09: the teacher takes attendance for a 15-student class by keyboard; it's saved per change.
import { expect, test } from '@playwright/test';
import { teachingClass, type TeachingClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.use({ storageState: stateFile('teacher') });
let c: TeachingClass;
test.beforeAll(async () => {
  c = await teachingClass();
});

test('takes week 2’s attendance by keyboard only, saved as it goes', async ({ page }) => {
  await page.goto(`/teacher/classes/${c.classId}/weeks/2`);
  await page.getByRole('link', { name: 'Attendance' }).click();
  const sheet = page.getByRole('table', { name: 'Attendance' });
  await expect(sheet.getByRole('radiogroup')).toHaveCount(15);
  await expect(page.getByText('Not saved yet')).toBeVisible();
  await expectAccessible(page);

  // Everyone starts as Present. Arrow keys change a student; Tab moves on (past their Note button).
  await sheet.getByRole('radiogroup', { name: c.students[0] }).getByRole('radio', { name: 'Present' }).focus();
  const changes: Record<number, 'ArrowRight' | 'ArrowLeft'> = { 2: 'ArrowRight', 5: 'ArrowLeft', 9: 'ArrowLeft' }; // late, excused, excused
  for (let i = 0; i < 15; i++) {
    if (changes[i]) {
      await page.keyboard.press(changes[i]!);
      await expect(page.getByRole('status', { name: 'Attendance saved' })).toContainText(c.students[i]!);
    }
    if (i < 14) {
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
    }
  }
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight'); // Present → Late → Absent
  await expect(page.getByRole('status', { name: 'Attendance saved' })).toContainText(`${c.students[14]} is absent`);
  await expect(page.getByTestId('attendance-counts')).toHaveText('11 present · 1 late · 1 absent · 2 excused');

  await page.reload();
  const group = (i: number) => page.getByRole('table', { name: 'Attendance' }).getByRole('radiogroup', { name: c.students[i] });
  await expect(group(2).getByRole('radio', { name: 'Late' })).toBeChecked();
  await expect(group(5).getByRole('radio', { name: 'Excused' })).toBeChecked();
  await expect(group(14).getByRole('radio', { name: 'Absent' })).toBeChecked();
  await expect(group(0).getByRole('radio', { name: 'Present' })).toBeChecked();
  await expect(page.getByText('Not saved yet')).toHaveCount(0);
});

test('adds a note to a mark', async ({ page }) => {
  await page.goto(`/teacher/classes/${c.classId}/weeks/2/attendance`);
  await page.getByRole('button', { name: `Note for ${c.students[5]}` }).click();
  const dialog = page.getByRole('dialog', { name: `Note for ${c.students[5]}` });
  await dialog.getByLabel('Note').fill('Family wedding');
  await dialog.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByRole('table', { name: 'Attendance' }).getByRole('row', { name: new RegExp(c.students[5]!) })).toContainText(
    'Family wedding',
  );
});

test('a future week can’t be taken yet; the class page shows each student’s attendance', async ({ page }) => {
  await page.goto(`/teacher/classes/${c.classId}/weeks/10/attendance`);
  await expect(page.getByText(/Attendance opens on/)).toBeVisible();
  await expect(page.getByRole('radiogroup')).toHaveCount(0);

  await page.goto(`/teacher/classes/${c.classId}`);
  const roster = page.getByRole('table', { name: 'Students' });
  // absent in week 2; week 1 may also have been taken by the phone spec (present)
  await expect(roster.getByRole('row', { name: new RegExp(c.students[14]!) })).toContainText(/\D(0|50)%$/);
  await expect(roster.getByRole('row', { name: new RegExp(c.students[2]!) })).toContainText('100%');
});
