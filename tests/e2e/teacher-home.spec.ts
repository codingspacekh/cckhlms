// FR-TCH-21 (M8): a teacher's "Today" in the approved design: a greeting, their next class with Take attendance,
// what to know before class, and their classes.
import { expect, test } from '@playwright/test';
import { teachingClass, type TeachingClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.use({ storageState: stateFile('teacher') });
let c: TeachingClass;
test.beforeAll(async () => {
  c = await teachingClass();
});

test('greets the teacher and leads with the next class', async ({ page }) => {
  await page.goto('/teacher');
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), Sophea$/ })).toBeVisible();
  await expect(page.getByText('Your next class')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Take attendance' })).toBeVisible();
  const before = page.getByRole('region', { name: 'Before class' });
  await expect(before).toContainText(/questions? waiting/);
  await expectAccessible(page);
});

test('lists the teacher’s classes with the next session, and opens one', async ({ page }) => {
  await page.goto('/teacher');
  const card = page.getByRole('region', { name: 'My classes' }).getByRole('article', { name: c.className });
  await expect(card).toContainText(/Next session.+ · \d\d:\d\d–\d\d:\d\dWeek \d+/);
  await card.getByRole('link', { name: 'Open class' }).click();
  await expect(page.getByRole('group', { name: `${c.className} sections` }).getByRole('link', { name: 'Weeks' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
