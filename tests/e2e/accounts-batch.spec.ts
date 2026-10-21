// FR-AUTH-08 · FR-AUTH-09: Admin imports a class's students from a CSV and prints their login slips; later, prints a
// new slip for a student who lost theirs. Each student signs in with what is on their slip.
import { expect, test, type Browser } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { slipsClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.use({ storageState: stateFile('admin') });
test.describe.configure({ mode: 'serial' });
let c: Awaited<ReturnType<typeof slipsClass>>;
test.beforeAll(async () => {
  c = await slipsClass();
});

async function signIn(browser: Browser, username: string, password: string, ip: string) {
  const ctx = await browser.newContext({
    baseURL: E2E.lms,
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { 'cf-connecting-ip': ip },
  });
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  return { page, ctx };
}

const CSV = 'name,username,guardian name,guardian phone\nSreymom Keo,,Mrs Keo,012 222 333\nRatana Chhim,ratana,,\nសុខា ពេជ្រ,,,\n';
let slip = { username: '', password: '' };

test('Admin checks a CSV, fixes it, imports it into a class and prints the slips', async ({ page }) => {
  await page.goto('/admin/people');
  await page.getByRole('link', { name: 'Import students' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Import students' })).toBeVisible();
  await expectAccessible(page);

  await page.getByLabel('CSV file').setInputFiles({ name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from(`${CSV},,,012\n`) });
  await expect(page.getByRole('main').getByRole('alert')).toContainText("Line 5: Enter the person's full name.");
  await expect(page.getByRole('button', { name: /^Create/ })).toHaveCount(0);

  await page.getByLabel('CSV file').setInputFiles({ name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  const preview = page.getByRole('table', { name: 'Students in the file' });
  await expect(preview.getByRole('row')).toHaveCount(4);
  await expect(preview.getByRole('row', { name: /Sreymom Keo/ })).toContainText('sreymom.ksuggested');
  await expectAccessible(page);
  await page.getByLabel('Enrol them in').selectOption(c.classId);
  await page.getByRole('button', { name: 'Create 3 accounts' }).click();

  const sheet = page.getByRole('region', { name: 'Login slips' });
  await expect(sheet.getByRole('heading')).toHaveText(`3 accounts created and enrolled in ${c.className}`);
  await expect(sheet.getByRole('listitem')).toHaveCount(3);
  await expect(sheet.getByRole('listitem').nth(2)).toContainText('Name: សុខា ពេជ្រ');
  await expectAccessible(page);
  const first = sheet.getByRole('listitem').first();
  slip = {
    username: (await first.getByTestId('slip-username').textContent())!,
    password: (await first.getByTestId('slip-password').textContent())!,
  };
  expect(slip.username).toBe('sreymom.k');

  // Printing shows the slips and nothing else.
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: 'Sections' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print slips' })).toBeHidden();
  await expect(first).toBeVisible();
  await page.emulateMedia({ media: 'screen' });

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/admin\/people\?role=student$/);
  await expect(page.getByRole('row', { name: /Ratana Chhim/ })).toBeVisible();
});

test('the imported student signs in with their slip', async ({ browser }) => {
  const { page, ctx } = await signIn(browser, slip.username, slip.password, '198.18.0.61');
  await expect(page.getByRole('heading', { level: 1, name: 'Hi Sreymom' })).toBeVisible();
  await expect(page.getByText(c.className.split(' · ')[0]!).first()).toBeVisible();
  await ctx.close();
});

test('Admin prints a new slip for one student of the class; the old password stops working', async ({ page, browser }) => {
  await page.goto(`/admin/classes/${c.classId}`);
  await page.getByRole('link', { name: 'Login slips' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Login slips' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('checkbox', { name: 'Choose Sreymom Keo' }).check();
  await page.getByRole('button', { name: 'New passwords and slips (1)' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Give 1 student a new password?');
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Give new passwords' }).click();

  const sheet = page.getByRole('region', { name: 'Login slips' });
  await expect(sheet.getByRole('listitem')).toHaveCount(1);
  await expect(sheet.getByRole('listitem')).toContainText(c.className);
  const password = (await sheet.getByTestId('slip-password').textContent())!;
  expect(password).not.toBe(slip.password);

  const old = await signIn(browser, slip.username, slip.password, '198.18.0.62');
  await expect(old.page.locator('form').getByRole('alert')).toHaveText('Wrong username or password.');
  await old.ctx.close();
  const fresh = await signIn(browser, slip.username, password, '198.18.0.63');
  await expect(fresh.page.getByRole('heading', { level: 1, name: 'Hi Sreymom' })).toBeVisible();
  await fresh.ctx.close();
});
