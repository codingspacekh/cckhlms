// FR-TCH-01/02 · FR-STU-02, 12 · NFR-05: the teacher writes and publishes a weekly lesson; the student reads it.
import { expect, test } from '@playwright/test';
import { teachingClass, type TeachingClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible, watchProblems } from './helpers';

test.describe.configure({ mode: 'serial' });
let c: TeachingClass;
test.beforeAll(async () => {
  c = await teachingClass();
});

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('opens week 3 from the class and publishes its lesson, with a live preview', async ({ page }) => {
    const problems = await watchProblems(page);
    await page.goto('/teacher');
    await page.getByRole('article', { name: c.className }).getByRole('link', { name: 'Open class' }).click();
    const weeks = page.getByRole('table', { name: 'Weeks' });
    await expect(weeks.getByRole('row', { name: /Week 3/ })).toContainText('Not written yet');
    await weeks.getByRole('link', { name: 'Week 3' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Week 3' })).toBeVisible();

    const form = page.getByRole('form', { name: 'Lesson note' });
    await form.getByLabel('Title').fill('Repeating things with for loops');
    await form
      .getByLabel('Lesson note')
      .fill(
        '## What we did\nWe used **for loops**.\n\n```python\nfor i in range(5):\n    print("Lap", i + 1)\n```\n\n> [!TIP]\n> range(5) stops before 5.\n\n<img src=x onerror=alert(1)>',
      );
    await form.getByRole('checkbox', { name: 'for loops & range()' }).check();
    const preview = page.getByRole('region', { name: 'Preview' });
    await expect(preview.getByRole('heading', { name: 'What we did' })).toBeVisible();
    await expect(preview.locator('strong', { hasText: 'for loops' })).toBeVisible();
    await expect(preview.getByRole('note')).toHaveText('Tip: range(5) stops before 5.');
    await expect(preview.locator('.code-lang')).toHaveText('Python');
    await expect(preview).toContainText('<img src=x onerror=alert(1)>');
    await expectAccessible(page);

    await form.getByRole('button', { name: 'Publish now' }).click();
    await expect(page.getByRole('status')).toContainText('Lesson published');
    await expect(form.getByText('Published', { exact: true })).toBeVisible();
    expect(await problems.cspViolations()).toEqual([]);

    await page.getByRole('main').getByRole('link', { name: c.className }).click(); // the sidebar lists it too
    await expect(page.getByRole('table', { name: 'Weeks' }).getByRole('row', { name: /Week 3/ })).toContainText('Published');
  });

  test('schedules week 4 to appear later, and saves week 5 as a draft', async ({ page }) => {
    await page.goto(`/teacher/classes/${c.classId}/weeks/4`);
    const form = page.getByRole('form', { name: 'Lesson note' });
    await form.getByLabel('Title').fill('While loops and guessing games');
    await form.getByLabel('Lesson note').fill('Coming soon');
    await form.getByText('Schedule for later').click();
    await form.getByLabel('Publish on').fill('2099-01-03');
    await form.getByLabel('At').fill('10:30');
    await form.getByRole('button', { name: 'Schedule', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Students will see it on Sat 3 Jan 2099 at 10:30');

    await page.getByRole('link', { name: 'Week 5' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Week 5' })).toBeVisible();
    await page.getByRole('form', { name: 'Lesson note' }).getByLabel('Title').fill('Lists');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('status')).toContainText('Draft saved');
  });
});

test.describe('student', () => {
  test.use({ storageState: stateFile('student'), permissions: ['clipboard-read', 'clipboard-write'] });

  test('sees only the published lesson, by week, and reads it', async ({ page }) => {
    const problems = await watchProblems(page);
    await page.goto('/student');
    await page.getByRole('link', { name: c.className }).click();
    const list = page.getByRole('list', { name: 'Lessons' });
    await expect(list.getByRole('link', { name: 'Week 3: Repeating things with for loops' })).toBeVisible();
    await expect(list.getByRole('link', { name: /Week 4/ })).toHaveCount(0); // scheduled for later
    await expect(list.getByRole('link', { name: /Week 5/ })).toHaveCount(0); // draft
    await expect(list).toContainText('for loops & range()');
    await expectAccessible(page);

    await list.getByRole('link', { name: /Repeating things with for loops/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Repeating things with for loops' })).toBeVisible();
    const note = page.getByRole('article', { name: 'Lesson note' });
    await expect(note.locator('pre code')).toContainText('print("Lap", i + 1)');
    await expect(note).toContainText('<img src=x onerror=alert(1)>');
    await expect(note.locator('img')).toHaveCount(0);
    await expect(note.getByRole('note')).toHaveText('Tip: range(5) stops before 5.');
    await note.getByRole('button', { name: 'Copy' }).click();
    await expect(note.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('for i in range(5):\n    print("Lap", i + 1)');
    await expectAccessible(page);
    expect(await problems.cspViolations()).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);
  });

  test('can’t open the teacher’s editor, or a week that isn’t published', async ({ page }) => {
    const res = await page.goto(`/teacher/classes/${c.classId}/weeks/3`);
    expect(res?.status()).toBe(403);
    await page.goto(`/student/classes/${c.classId}/weeks/5`);
    await expect(page.getByText('This lesson isn’t published yet.')).toBeVisible();
  });
});
