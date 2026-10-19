// FR-ADM-05/06 · FR-TCH-05 · BR-15: Admin creates a weekend class and manages its sessions.
import { expect, test } from '@playwright/test';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.use({ storageState: stateFile('admin') });
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  // A term and a course for this file (academics.spec.ts may run in another order).
  const page = await (await browser.newContext({ storageState: stateFile('admin') })).newPage();
  await page.goto('/admin/terms');
  const t = page.getByRole('form', { name: 'Add a term' });
  await t.getByLabel('Year').fill('2028');
  await t.getByLabel('Term').selectOption('1');
  await t.getByLabel('First day').fill('2028-01-08');
  await t.getByLabel('Last day').fill('2028-04-02');
  await t.getByRole('button', { name: 'Add term' }).click();
  await expect(page.getByRole('row', { name: /Term 1 · 2028/ })).toBeVisible();
  await page.goto('/admin/courses');
  await page.getByRole('button', { name: 'Add a course' }).click();
  const c = page.getByRole('form', { name: 'Add a course' });
  await c.getByLabel('Code').fill('JV1');
  await c.getByLabel('Course name').fill('Java Level 1');
  await c.getByLabel('Language').selectOption('java');
  await c.getByRole('button', { name: 'Add course' }).click();
  await expect(page.getByRole('row', { name: /JV1/ })).toBeVisible();
});

test('Admin creates a weekend class, seeing its weekly sessions before saving', async ({ page }) => {
  await page.goto('/admin/classes/new');
  await expectAccessible(page);
  const form = page.getByRole('form', { name: 'New class' });
  await form.getByLabel('Course').selectOption({ label: 'JV1 · Java Level 1' });
  await form.getByLabel('Term').selectOption({ label: 'Term 1 · 2028' });
  await form.getByRole('radio', { name: 'Saturday' }).check();
  await form.getByLabel('Start time').fill('14:00');
  await form.getByRole('radio', { name: '120 min' }).check();
  await form.getByLabel('First session').fill('2028-01-08');
  await form.getByLabel('Weeks').selectOption('10');
  await form.getByLabel('Lead teacher').selectOption({ label: 'Sophea Chan' });
  await form.getByLabel('Room').fill('Room B');

  const preview = page.getByRole('list', { name: 'Weekly sessions' });
  await expect(preview.getByRole('listitem')).toHaveCount(10);
  await preview.getByRole('button', { name: /Sat 22 Jan 2028/ }).click(); // a public holiday
  await expect(preview.getByRole('listitem')).toHaveCount(11);
  await expect(preview.getByRole('listitem').last()).toContainText('Week 10');

  await form.getByRole('button', { name: 'Create class' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Java Level 1 · Sat 14:00' })).toBeVisible();
  await expect(page.getByText('Saturday 14:00–16:00 · 10 weeks')).toBeVisible();
  await expectAccessible(page);
});

test('a first date on the wrong day is refused with a clear message', async ({ page }) => {
  await page.goto('/admin/classes/new');
  const form = page.getByRole('form', { name: 'New class' });
  await form.getByLabel('Course').selectOption({ label: 'JV1 · Java Level 1' });
  await form.getByLabel('Term').selectOption({ label: 'Term 1 · 2028' });
  await form.getByRole('radio', { name: 'Sunday' }).check();
  await form.getByLabel('First session').fill('2028-01-08');
  await expect(form.getByRole('alert')).toContainText('not a Sunday');
});

test('Admin cancels a session on the class page and a week is added at the end', async ({ page }) => {
  await page.goto('/admin/classes');
  await page.getByRole('link', { name: 'Java Level 1 · Sat 14:00' }).click();
  const weeks = page.getByRole('table', { name: 'Sessions' });
  await expect(weeks.getByRole('row', { name: /^Week 10\b/ })).toContainText('Sat 18 Mar 2028');
  await weeks
    .getByRole('row', { name: /^Week 4\b/ })
    .getByRole('button', { name: 'Cancel' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Cancel this session' });
  await dialog.getByLabel('Reason').fill('Teacher training day');
  await dialog.getByRole('button', { name: 'Cancel session' }).click();
  await expect(weeks.getByRole('row', { name: /^Week 10\b/ })).toContainText('Sat 25 Mar 2028');
  await expect(weeks.getByText('Teacher training day')).toBeVisible();
});
