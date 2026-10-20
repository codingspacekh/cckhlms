// FR-TCH-19 · FR-STU-06 · BR-12: the teacher types a whole class's paper-quiz scores into the gradebook with the
// keyboard (M4 exit criterion: under 2 minutes), excuses one student, and it all survives a reload; the student
// sees their mark. Cell rules and the overall score are covered by the unit and integration tests.
import { expect, test } from '@playwright/test';
import { paperQuiz, teachingClass, type TeachingClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.describe.configure({ mode: 'serial' });
let c: TeachingClass;
let quiz: Awaited<ReturnType<typeof paperQuiz>>;
test.beforeAll(async () => {
  c = await teachingClass();
  quiz = await paperQuiz();
});
// Scores 10, 9.5, 9, … down the class; the last student is excused.
const scoreFor = (i: number) => String(10 - i * 0.5);

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('enters the class’s quiz scores down the column with the keyboard, in under 2 minutes', async ({ page }) => {
    await page.goto(`/teacher/classes/${c.classId}`);
    await page
      .getByRole('group', { name: `${c.className} sections` })
      .getByRole('link', { name: 'Gradebook' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: c.className })).toBeVisible();
    const cell = (name: string) => page.getByRole('textbox', { name: `${name}, ${quiz.title} (out of 10)` });
    await expect(page.getByRole('row', { name: new RegExp(c.students[2]!) })).toContainText('Missing'); // held, nothing entered
    await expectAccessible(page);

    const started = Date.now();
    await cell(c.students[0]!).click();
    for (const [i] of c.students.entries()) {
      await page.keyboard.type(i === c.students.length - 1 ? 'ex' : scoreFor(i));
      await page.keyboard.press('Enter');
    }
    const last = c.students.at(-1)!;
    await expect(page.getByRole('status')).toHaveText(`Saved: ${last}, ${quiz.title}.`);
    expect(Date.now() - started).toBeLessThan(120_000);

    await page.reload();
    for (const [i, name] of c.students.entries()) await expect(cell(name)).toHaveValue(i === c.students.length - 1 ? 'ex' : scoreFor(i));
    // A student with nothing else marked or missing: the quiz is their whole overall score.
    await expect(page.getByRole('row', { name: new RegExp(c.students[2]!) })).toContainText('90.0');

    // FR-TCH-17: the Students tab shows the same current standing.
    await page
      .getByRole('group', { name: `${c.className} sections` })
      .getByRole('link', { name: 'Students' })
      .click();
    await expect(page.getByRole('columnheader', { name: 'Standing' })).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(c.students[2]!) })).toContainText('90.0');
  });

  test('a comment on a cell is saved with the mark', async ({ page }) => {
    await page.goto(`/teacher/classes/${c.classId}/gradebook`);
    await page.getByRole('textbox', { name: `${c.students[0]}, ${quiz.title} (out of 10)` }).focus();
    await page.getByLabel('Comment', { exact: true }).fill('Full marks. Great work!');
    await page.getByRole('button', { name: 'Save comment' }).click();
    await expect(page.getByRole('status')).toHaveText(`Comment saved: ${c.students[0]}, ${quiz.title}.`);
  });
});

test.describe('student', () => {
  test.use({ storageState: stateFile('student') });

  test('sees the quiz mark and comment', async ({ page }) => {
    await page.goto(`/student/classes/${c.classId}`);
    const item = page.getByRole('listitem').filter({ hasText: quiz.title });
    await expect(item).toContainText('Marked 10 / 10');
    await item.getByRole('link', { name: quiz.title }).click();
    const mark = page.getByRole('region', { name: 'Your mark' });
    await expect(mark.getByTestId('score')).toHaveText('10 / 10');
    await expect(mark).toContainText('Full marks. Great work!');
    await expectAccessible(page);
  });
});
