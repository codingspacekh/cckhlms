// FR-STU-01 · FR-STU-11 (M8): a student's "My week" in the approved design: a greeting with the next class, the term
// puzzle, what's left to do and their latest project; their class in the sidebar.
import { expect, test } from '@playwright/test';
import { teachingClass, type TeachingClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.use({ storageState: stateFile('student') });
let c: TeachingClass;
test.beforeAll(async () => {
  c = await teachingClass(); // started three Saturdays ago: weeks 1-3 are over, week 4 is next
});

test('greets the student with the next class and its lesson', async ({ page }) => {
  await page.goto('/student');
  const hello = page.getByRole('region', { name: 'Hi Bopha!' });
  await expect(hello.getByRole('list', { name: 'Next class' })).toBeVisible();
  await expect(hello.getByRole('link', { name: /^Open Week \d+ lesson$/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: c.className })).toBeVisible();
  await expectAccessible(page);
});

test('shows the term puzzle for the class, one piece per week, with this week marked', async ({ page }) => {
  await page.goto('/student');
  const short = c.className.split(' · ')[0]!;
  const puzzle = page.getByRole('list', { name: `Weeks of ${short}` });
  await expect(puzzle.getByRole('listitem')).toHaveCount(12);
  await expect(puzzle.getByRole('listitem', { name: /: This week$/ })).toHaveCount(1);
  await expect(puzzle.getByRole('listitem', { name: 'Week 12: Coming up' })).toBeVisible();
  await expect(page.getByText(/^\d+ of 12 pieces$/).first()).toBeVisible();
});

test('lists what is left to do and offers the Playground', async ({ page }) => {
  await page.goto('/student');
  await expect(page.getByRole('region', { name: 'To do' })).toBeVisible();
  const project = page.getByRole('region', { name: 'My latest project' });
  await expect(project.getByRole('link', { name: /Keep coding|Open the Playground/ })).toBeVisible();
});

test('opens the class from the sidebar', async ({ page }) => {
  await page.goto('/student');
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: c.className }).click();
  await expect(page.getByRole('heading', { level: 1, name: c.className })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: c.className })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
