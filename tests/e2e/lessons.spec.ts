// FR-TCH-01/02, 22 · FR-STU-02, 12 · NFR-05: the teacher writes and publishes a weekly lesson; the student reads it.
import { expect, test } from '@playwright/test';
import { teachingClass, type TeachingClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible, watchProblems, writeNote } from './helpers';

test.describe.configure({ mode: 'serial' });
let c: TeachingClass;
test.beforeAll(async () => {
  c = await teachingClass();
});

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('opens week 3 from the class and publishes its lesson, seeing it as students will', async ({ page }) => {
    const problems = await watchProblems(page);
    await page.goto('/teacher');
    await page.getByRole('article', { name: c.className }).getByRole('link', { name: 'Open class' }).click();
    const weeks = page.getByRole('table', { name: 'Weeks' });
    await expect(weeks.getByRole('row', { name: /Week 3/ })).toContainText('Not written yet');
    await weeks.getByRole('link', { name: 'Week 3' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Week 3' })).toBeVisible();

    const form = page.getByRole('form', { name: 'Lesson note' });
    await form.getByLabel('Title').fill('Repeating things with for loops');
    await writeNote(
      page,
      '## What we did\nWe used **for loops**.\n\n```python\nfor i in range(5):\n    print("Lap", i + 1)\n```\n\n> [!TIP]\n> range(5) stops before 5.\n\n<img src=x onerror=alert(1)>',
    );
    await page.getByRole('checkbox', { name: 'for loops & range()' }).check();
    await expectAccessible(page);
    await form.getByRole('button', { name: 'Student view' }).click();
    const preview = form.getByRole('region', { name: 'Student view' });
    await expect(preview.getByRole('heading', { name: 'What we did' })).toBeVisible();
    await expect(preview.locator('strong', { hasText: 'for loops' })).toBeVisible();
    await expect(preview.getByRole('note')).toHaveText('Tip: range(5) stops before 5.');
    await expect(preview.locator('.code-lang')).toHaveText('Python');
    await expect(preview).toContainText('<img src=x onerror=alert(1)>');
    await expect(preview).toContainText('for loops & range()');
    await expectAccessible(page);

    const publish = page.getByRole('region', { name: 'Publish' });
    await publish.getByRole('button', { name: 'Publish now' }).click();
    await expect(page.getByRole('status')).toContainText('Lesson published');
    await expect(publish.getByText('Published', { exact: true })).toBeVisible();
    expect(await problems.cspViolations()).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);

    await page.getByRole('main').getByRole('link', { name: c.className }).click(); // the sidebar lists it too
    await expect(page.getByRole('table', { name: 'Weeks' }).getByRole('row', { name: /Week 3/ })).toContainText('Published');
  });

  test('schedules week 4 to appear later, and saves week 5 as a draft', async ({ page }) => {
    await page.goto(`/teacher/classes/${c.classId}/weeks/4`);
    await page.getByLabel('Title').fill('While loops and guessing games');
    await writeNote(page, 'Coming soon');
    const publish = page.getByRole('region', { name: 'Publish' });
    await publish.getByText('Schedule for later').click();
    await publish.getByLabel('Publish on').fill('2099-01-03');
    await publish.getByLabel('At').fill('10:30');
    await publish.getByRole('button', { name: 'Schedule', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Students will see it on Sat 3 Jan 2099 at 10:30');

    await page.getByRole('link', { name: 'Week 5' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Week 5' })).toBeVisible();
    await page.getByLabel('Title').fill('Lists');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('status')).toContainText('Draft saved');
  });

  test('writes week 9 with the toolbar, the / menu and Markdown shortcuts', async ({ page }) => {
    const problems = await watchProblems(page);
    await page.goto(`/teacher/classes/${c.classId}/weeks/9`);
    await page.getByLabel('Title').fill('Counting down');
    const doc = page.getByRole('textbox', { name: 'Lesson note' });
    await doc.click();
    await page.keyboard.type('Rockets');
    await page.getByRole('combobox', { name: 'Text style' }).selectOption('Heading');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- count down\nlift off\n\n'); // "- " starts a list; an empty item ends it
    await page.keyboard.type('/');
    const menu = page.getByRole('menu', { name: 'Add' });
    await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await expectAccessible(page);
    await page.keyboard.press('Enter'); // Code
    await expect(menu).toHaveCount(0);
    await page.keyboard.type('for i in range(3, 0, -1):\n    print(i)\n\n\n'); // three Enters leave the block
    await page.keyboard.type('Indent with four spaces.');
    const tip = page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Tip box' });
    await tip.click();
    await expect(tip).toHaveAttribute('aria-pressed', 'true');
    await expect(doc.getByRole('combobox', { name: 'Language' })).toHaveValue('python');

    await page.getByRole('button', { name: 'Student view' }).click();
    const preview = page.getByRole('region', { name: 'Student view' });
    await expect(preview.getByRole('heading', { name: 'Rockets' })).toBeVisible();
    await expect(preview.getByRole('listitem')).toHaveText(['count down', 'lift off']);
    await expect(preview.locator('pre code')).toHaveText('for i in range(3, 0, -1):\n    print(i)');
    await expect(preview.getByRole('note')).toHaveText('Tip: Indent with four spaces.');
    await page.getByRole('button', { name: 'Write' }).click();
    await page.getByRole('region', { name: 'Publish' }).getByRole('button', { name: 'Publish now' }).click();
    await expect(page.getByRole('status')).toContainText('Lesson published');
    expect(await problems.cspViolations()).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);
  });

  test('a draft saves by itself, and is there after reloading', async ({ page }) => {
    await page.goto(`/teacher/classes/${c.classId}/weeks/11`);
    await page.getByLabel('Title').fill('Saved by itself');
    await writeNote(page, 'Nobody pressed **Save**.');
    const publish = page.getByRole('region', { name: 'Publish' });
    await expect(publish.getByText(/^Draft saved at /)).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByLabel('Title')).toHaveValue('Saved by itself');
    await expect(page.getByRole('textbox', { name: 'Lesson note' }).locator('strong')).toHaveText('Save');
    await expect(publish.getByText('Draft', { exact: true })).toBeVisible();
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
    await expect(list.getByRole('link', { name: /Week 11/ })).toHaveCount(0); // saved by itself, still a draft
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
