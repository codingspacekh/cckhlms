// NFR-07: a guardian asks for their child's data and then for it to be deleted. Admin downloads it from the
// student's page, deletes the personal data after typing the username, and the student is signed out for good.
import { readFile } from 'node:fs/promises';
import { expect, test, type Browser } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.use({ storageState: stateFile('admin') });

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

test('Admin downloads a student’s data, then deletes their personal data', async ({ page, browser }) => {
  await page.goto('/admin/people');
  await page.getByRole('button', { name: 'Add a person' }).click();
  const form = page.getByRole('form', { name: 'Add a person' });
  await form.getByLabel('Full name').fill('Malis Chea');
  await form.getByLabel('Guardian name').fill('Mrs Chea');
  await form.getByLabel('Guardian phone').fill('012 000 004');
  await form.getByRole('button', { name: 'Create account' }).click();
  const slip = page.getByRole('dialog').getByRole('region', { name: 'Login slip' });
  const username = (await slip.getByTestId('slip-username').textContent())!;
  const password = (await slip.getByTestId('slip-password').textContent())!;
  await slip.getByRole('button', { name: 'Done' }).click();

  const { page: kid, ctx } = await signIn(browser, username, password, '198.18.0.71');
  await expect(kid).toHaveURL(/\/student$/);

  await page.getByRole('link', { name: 'Report for Malis Chea' }).click();
  const card = page.getByRole('region', { name: 'Personal data' });
  await expect(card).toBeVisible();
  await expectAccessible(page);
  const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('link', { name: 'Download their data' }).click()]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`^student-data-${username.replace('.', '\\.')}-\\d{4}-\\d{2}-\\d{2}\\.json$`));
  const data = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(data.student).toMatchObject({ name: 'Malis Chea', username, guardianName: 'Mrs Chea', guardianPhone: '012 000 004' });
  expect(data.signIns).toHaveLength(1);

  await card.getByRole('button', { name: 'Delete personal data…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this student’s personal data?' });
  await expectAccessible(page);
  await dialog.getByLabel(/Type their username/).fill(username);
  await dialog.getByRole('button', { name: 'Delete personal data' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Deleted student' })).toBeVisible();
  await expect(card).toContainText('Their personal data was deleted on');
  await expect(card.getByRole('button', { name: 'Delete personal data…' })).toHaveCount(0);

  // The student is signed out everywhere, and can't sign in again.
  await kid.reload();
  await expect(kid).toHaveURL(/\/login/);
  await ctx.close();
  const again = await signIn(browser, username, password, '198.18.0.72');
  await expect(again.page.getByRole('alert')).toBeVisible();
  await expect(again.page).toHaveURL(/\/login/);
  await again.ctx.close();

  // M16b: they're on People's Archived list now, as a deleted student.
  await page.goto('/admin/people?role=student&show=archived');
  await expect(page.getByRole('row', { name: /Malis Chea/ })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Deleted student/ }).first()).toContainText('Personal data deleted');
});
