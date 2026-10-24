// FR-ADM-03/04: Admin sets up terms and courses in the browser.
import { expect, test } from '@playwright/test';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.use({ storageState: stateFile('admin') });

// Years far from today: the shared fixture's term (tests/e2e/fixtures.ts) runs 100 days from three weeks ago, so a
// term in the next year collided with it once today reached late October (2026-10-24).
test('Admin adds a term and makes it the active term', async ({ page }) => {
  await page.goto('/admin/terms');
  await expectAccessible(page);
  const form = page.getByRole('form', { name: 'Add a term' });
  await form.getByLabel('Year').fill('2031');
  await form.getByLabel('Term').selectOption('1');
  await form.getByLabel('First day').fill('2031-01-11');
  await form.getByLabel('Last day').fill('2031-03-30');
  await form.getByRole('button', { name: 'Add term' }).click();

  const row = page.getByRole('row', { name: /Term 1 · 2031/ });
  await expect(row.getByText('Planned')).toBeVisible();
  await row.getByRole('button', { name: 'Make active' }).click();
  await expect(row.getByText('Active')).toBeVisible();
});

test('a term that overlaps another is refused with a clear message', async ({ page }) => {
  await page.goto('/admin/terms');
  const form = page.getByRole('form', { name: 'Add a term' });
  await form.getByLabel('Year').fill('2031');
  await form.getByLabel('Term').selectOption('2');
  await form.getByLabel('First day').fill('2031-03-22');
  await form.getByLabel('Last day').fill('2031-06-29');
  await form.getByRole('button', { name: 'Add term' }).click();
  await expect(form.getByRole('alert')).toHaveText('These dates overlap Term 1 · 2031.');
});

test('Admin adds a course and writes its syllabus', async ({ page }) => {
  await page.goto('/admin/courses');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Add a course' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a course' });
  await expect(dialog).toBeVisible();
  await expectAccessible(page);
  const form = dialog.getByRole('form', { name: 'Add a course' });
  await form.getByLabel('Code').fill('py1');
  await form.getByLabel('Course name').fill('Python Level 1');
  await form.getByLabel('Language').selectOption('python');
  await form.getByRole('button', { name: 'Add course' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('PY1 added.');

  const row = page.getByRole('row', { name: /PY1/ });
  await expect(row).toContainText('Python Level 1');
  await expect(row).toContainText('60 / 30 / 10');
  await row.getByRole('link', { name: 'Edit PY1' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'PY1 · Python Level 1' })).toBeVisible();
  await expectAccessible(page);
  const syllabus = page.getByRole('form', { name: 'Syllabus' });
  await syllabus.getByLabel('Topics, one per line').fill('Output with print()\nVariables & input()\nConditions: if / elif / else\n');
  await syllabus.getByRole('button', { name: 'Save syllabus' }).click();
  await expect(syllabus.getByRole('status')).toHaveText('Syllabus saved: 3 topics.');
  await expect(syllabus.getByRole('listitem')).toHaveText(['Output with print()', 'Variables & input()', 'Conditions: if / elif / else']);

  await page.goto('/admin/courses');
  await expect(page.getByRole('row', { name: /PY1/ })).toContainText('3 topics');
});

test('course weights must add up to 100', async ({ page }) => {
  await page.goto('/admin/courses');
  await page.getByRole('button', { name: 'Add a course' }).click();
  const form = page.getByRole('form', { name: 'Add a course' });
  await form.getByLabel('Code').fill('WEB');
  await form.getByLabel('Course name').fill('Web Basics');
  await form.getByLabel('Language').selectOption('web');
  await form.getByLabel('Exam %').fill('70');
  await form.getByRole('button', { name: 'Add course' }).click();
  await expect(form.getByRole('alert')).toHaveText('Exam, classwork and homework weights must add up to 100.');
});
