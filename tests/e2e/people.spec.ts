// FR-ADM-01/02/16 · FR-AUTH-03/04/07: Admin manages accounts and club settings in the browser.
import { expect, test, type Browser } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.use({ storageState: stateFile('admin') });

// Each sign-in comes from its own address, like real users behind Cloudflare (the login limit is per IP).
async function signInFresh(browser: Browser, username: string, password: string, ip: string) {
  // Empty storageState: otherwise the file's test.use (signed in as admin) applies to new contexts too.
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

async function addPerson(page: import('@playwright/test').Page, role: 'Student' | 'Teacher', name: string) {
  await page.goto('/admin/people');
  await page.getByRole('button', { name: 'Add a person' }).click();
  const form = page.getByRole('form', { name: 'Add a person' });
  await form.getByLabel('Role').selectOption(role.toLowerCase());
  await form.getByLabel('Full name').fill(name);
  await form.getByRole('button', { name: 'Create account' }).click();
  const slip = page.getByRole('dialog').getByRole('region', { name: 'Login slip' });
  await expect(slip.getByText('Shown once')).toBeVisible();
  await expectAccessible(page);
  const values = {
    username: (await slip.getByTestId('slip-username').textContent())!,
    password: (await slip.getByTestId('slip-password').textContent())!,
  };
  await slip.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  return values;
}

test('the People page passes an accessibility check', async ({ page }) => {
  await page.goto('/admin/people');
  await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible();
  await expectAccessible(page);
});

test('Admin adds a student, and the student signs in with the login slip', async ({ page, browser }) => {
  const { username, password } = await addPerson(page, 'Student', 'Dalin Prak');
  expect(username).toBe('dalin.p');
  await expect(page.getByRole('row', { name: /Dalin Prak/ })).toBeVisible();

  const { page: kid, ctx } = await signInFresh(browser, username, password, '198.18.0.11');
  await expect(kid).toHaveURL(/\/student$/);
  await expect(kid.getByRole('heading', { level: 1, name: 'Hi Dalin' })).toBeVisible();
  await ctx.close();
});

test('Admin resets a password: the old one stops working, the new one works', async ({ page, browser }) => {
  const first = await addPerson(page, 'Teacher', 'Dara Kim');
  await page
    .getByRole('row', { name: /Dara Kim/ })
    .getByRole('button', { name: 'Reset password' })
    .click();
  const slip = page.getByRole('region', { name: 'Login slip' });
  await expect(slip.getByRole('heading')).toHaveText('New password for Dara Kim'); // opens in the dialog
  await expect(slip.getByTestId('slip-username')).toHaveText(first.username);
  const newPassword = (await slip.getByTestId('slip-password').textContent())!;
  expect(newPassword).not.toBe(first.password);

  const old = await signInFresh(browser, first.username, first.password, '198.18.0.12');
  await expect(old.page.locator('form').getByRole('alert')).toHaveText('Wrong username or password.');
  await old.ctx.close();
  const fresh = await signInFresh(browser, first.username, newPassword, '198.18.0.13');
  await expect(fresh.page).toHaveURL(/\/teacher$/);
  await fresh.ctx.close();
});

test('a switched-off account cannot sign in, and is told why', async ({ page, browser }) => {
  const kid = await addPerson(page, 'Student', 'Chenda Ouk');
  const row = page.getByRole('row', { name: /Chenda Ouk/ });
  await row.getByRole('button', { name: 'Switch off' }).click();
  await expect(row.getByText('Switched off')).toBeVisible();

  const attempt = await signInFresh(browser, kid.username, kid.password, '198.18.0.14');
  await expect(attempt.page.locator('form').getByRole('alert')).toHaveText('This account is switched off. Ask the club admin.');
  await attempt.ctx.close();

  await row.getByRole('button', { name: 'Switch on' }).click();
  await expect(row.getByText('Active')).toBeVisible();
});

test('Admin changes the club name and it appears in the top bar', async ({ page }) => {
  await page.goto('/admin/settings');
  await expectAccessible(page);
  await page.getByLabel('Club name').fill('CCKH Weekend Club');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toHaveText('Settings saved.');
  await expect(page.locator('.crumb')).toContainText('CCKH Weekend Club');
  await page.getByLabel('Club name').fill('CCKH Coding Club');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.locator('.crumb')).toContainText('CCKH Coding Club');
});

// M10 · BR-23: a typo in an account is fixed in place, and an account added by mistake is deleted.
test('Admin corrects a student’s details, and deletes an account nobody has used', async ({ page, browser }) => {
  const { username, password } = await addPerson(page, 'Student', 'Kunthea Prum');
  const row = page.getByRole('row', { name: /Kunthea Prum/ });
  await row.getByRole('button', { name: 'Edit Kunthea Prum' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Kunthea Prum' });
  await expect(dialog.getByLabel('Username')).toHaveValue(username);
  await expectAccessible(page);
  await dialog.getByLabel('Full name').fill('Kunthea Prom');
  await dialog.getByLabel('Username').fill('kunthea.prom');
  await dialog.getByLabel('Guardian phone').fill('012 555 777');
  await dialog.getByRole('button', { name: 'Save details' }).click();
  await expect(dialog).toBeHidden();
  const fixed = page.getByRole('row', { name: /Kunthea Prom/ });
  await expect(fixed).toContainText('kunthea.prom');
  await expect(fixed).toContainText('012 555 777');

  // The new username signs in with the same password.
  const { page: kid, ctx } = await signInFresh(browser, 'kunthea.prom', password, '198.18.0.31');
  await expect(kid).toHaveURL(/\/student$/);
  await ctx.close();

  await addPerson(page, 'Teacher', 'Wrong Person');
  const wrong = page.getByRole('row', { name: /Wrong Person/ });
  await page.goto('/admin/people?role=teacher');
  await wrong.getByRole('button', { name: 'Edit Wrong Person' }).click();
  await page.getByRole('button', { name: 'Delete account' }).click();
  await page.getByRole('button', { name: 'Yes, delete Wrong Person' }).click();
  await expect(page.getByRole('status')).toHaveText('Account deleted.');
  await expect(wrong).toHaveCount(0);
});
