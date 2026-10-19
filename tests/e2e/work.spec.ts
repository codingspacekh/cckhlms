// FR-TCH-07/08 · FR-STU-05 · BR-01: the teacher sets homework for a week; the student finds and opens it.
import { expect, test } from '@playwright/test';
import { teachingClass, type TeachingClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.describe.configure({ mode: 'serial' });
let c: TeachingClass;
test.beforeAll(async () => {
  c = await teachingClass();
});

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('sets Python homework for week 8, due at the next session, and a paper quiz as a draft', async ({ page }) => {
    await page.goto(`/teacher/classes/${c.classId}/weeks/8`);
    await page.getByRole('link', { name: 'Classwork & homework' }).click();
    await expect(page.getByText('Nothing set for this week yet.')).toBeVisible();

    await page.getByRole('button', { name: 'Set new work' }).click();
    const dialog = page.getByRole('dialog', { name: 'Set new work' });
    await expectAccessible(page);
    await expect(dialog.getByLabel('Due')).toHaveValue('next_session');
    await dialog.getByLabel('Title').fill('Countdown to lift off');
    await dialog.getByLabel(/^Instructions/).fill('Use a **for loop** to count down from 10 to 1, then print `Lift off!`.');
    await dialog.getByRole('button', { name: 'Publish' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toHaveText('“Countdown to lift off” is published to the class.');

    await page.getByRole('button', { name: 'Set new work' }).click();
    const quiz = page.getByRole('dialog', { name: 'Set new work' });
    await quiz.getByLabel('Type').selectOption('classwork');
    await quiz.getByLabel('Language').selectOption('paper');
    await quiz.getByLabel('Title').fill('Loops quiz');
    await quiz.getByRole('button', { name: 'Save draft' }).click();
    await expect(quiz).toBeHidden();

    const table = page.getByRole('table', { name: 'Work' });
    await expect(table.getByRole('row', { name: /Countdown to lift off/ })).toContainText(
      /HomeworkPython10\w{3} \d+ \w{3} \d{4}, 09:00Published/,
    );
    await expect(table.getByRole('row', { name: /Loops quiz/ })).toContainText(
      /ClassworkPaper \/ in class10\w{3} \d+ \w{3} \d{4}, 10:30Draft/,
    );
    await expectAccessible(page);
  });
});

test.describe('student', () => {
  test.use({ storageState: stateFile('student') });

  test('finds the published homework on the class page and opens it; drafts stay hidden', async ({ page }) => {
    await page.goto(`/student/classes/${c.classId}`);
    const list = page.getByRole('list', { name: 'Classwork and homework' });
    await expect(list).toContainText('Countdown to lift off');
    await expect(list).not.toContainText('Loops quiz');
    await list.getByRole('link', { name: 'Countdown to lift off' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Countdown to lift off' })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Instructions' }).locator('strong')).toHaveText('for loop');
    await expect(page.getByRole('region', { name: 'About this work' })).toContainText(/Due\w{3} \d+ \w{3} \d{4}, 09:00/);
    await expect(page.getByText('Late work is accepted, with 10% off.')).toBeVisible();
    await expectAccessible(page);
  });
});
