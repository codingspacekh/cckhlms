// FR-AUTH-06 (M13): admins and teachers change their own password on My account; students have no such page.
import { expect, test, type Page } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

// Its own teacher: a change signs out every other session, and the shared e2e accounts' sessions must survive.
const ME = { username: 'm13.teacher', name: 'Rina Kong', password: 'first-password-1' };

test.beforeAll(async () => {
  Object.assign(process.env, { DATABASE_URL: E2E.databaseUrl, BETTER_AUTH_URL: E2E.lms, BETTER_AUTH_SECRET: E2E.secret });
  const { db } = await import('../../src/db/client');
  const { user } = await import('../../src/db/schema');
  const { eq } = await import('drizzle-orm');
  const { seedUser } = await import('../../src/server/seed');
  await db.delete(user).where(eq(user.username, ME.username)); // a rerun on the same database
  await seedUser({ ...ME, role: 'teacher' });
});

async function signIn(page: Page, password: string) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(ME.username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('a teacher changes their password from My account and signs in with the new one', async ({ page }) => {
  await signIn(page, ME.password);
  await expect(page).toHaveURL(/\/teacher$/);
  await page
    .locator('.me')
    .getByRole('link', { name: /Rina Kong/ })
    .click();
  await expect(page).toHaveURL(/\/teacher\/account$/);
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible();
  await expect(page.getByText(ME.username, { exact: true })).toBeVisible();
  await expectAccessible(page);

  const form = page.getByRole('form', { name: 'Change password' });
  await form.getByLabel('Current password').fill('not-my-password');
  await form.getByLabel('New password', { exact: true }).fill('my-new-password-1');
  await form.getByLabel('New password again').fill('my-new-password-1');
  await form.getByRole('button', { name: 'Change password' }).click();
  await expect(form.getByText('That isn’t your current password.')).toBeVisible();
  await expectAccessible(page);

  await form.getByLabel('Current password').fill(ME.password);
  await form.getByLabel('New password', { exact: true }).fill('my-new-password-1');
  await form.getByLabel('New password again').fill('my-new-password-1');
  await form.getByRole('button', { name: 'Change password' }).click();
  await expect(form.getByRole('status')).toContainText('Password changed.');

  // Still signed in here; then out, and back in with the new password.
  await page.goto('/teacher');
  await expect(page).toHaveURL(/\/teacher$/);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, ME.password);
  await expect(page.locator('form').getByRole('alert')).toHaveText('Wrong username or password.');
  await signIn(page, 'my-new-password-1');
  await expect(page).toHaveURL(/\/teacher$/);
});

test.describe('admin', () => {
  test.use({ storageState: stateFile('admin') });
  test('has My account too', async ({ page }) => {
    await page.goto('/admin');
    await page
      .locator('.me')
      .getByRole('link', { name: /Club Admin/ })
      .click();
    await expect(page).toHaveURL(/\/admin\/account$/);
    await expect(page.getByRole('form', { name: 'Change password' })).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe('student', () => {
  test.use({ storageState: stateFile('student') });
  test('has no My account: the name is not a link, and the pages are refused', async ({ page }) => {
    await page.goto('/student');
    await expect(page.locator('.me').getByRole('link')).toHaveCount(0);
    for (const path of ['/teacher/account', '/admin/account']) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(403);
    }
  });
});
