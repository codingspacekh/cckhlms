// FR-AUTH-06 (M13, M16a): everyone changes their own password on My account; Admin can still reset a student's.
import { expect, test, type Page } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

// Their own teacher and student: a change signs out every other session, and the shared e2e accounts' sessions
// must survive.
const ME = { username: 'm13.teacher', name: 'Rina Kong', password: 'first-password-1' };
const KID = { username: 'm16.student', name: 'Malis Heng', password: 'tiger-moon-kite-42' };

test.beforeAll(async () => {
  Object.assign(process.env, { DATABASE_URL: E2E.databaseUrl, BETTER_AUTH_URL: E2E.lms, BETTER_AUTH_SECRET: E2E.secret });
  const { db } = await import('../../src/db/client');
  const { user } = await import('../../src/db/schema');
  const { inArray } = await import('drizzle-orm');
  const { seedUser } = await import('../../src/server/seed');
  await db.delete(user).where(inArray(user.username, [ME.username, KID.username])); // a rerun on the same database
  await seedUser({ ...ME, role: 'teacher' });
  await seedUser({ ...KID, role: 'student' });
});

async function signIn(page: Page, password: string, username = ME.username) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
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

  await page.getByRole('button', { name: 'Change password' }).click();
  const form = page.getByRole('dialog', { name: 'Change password' }).getByRole('form', { name: 'Change password' });
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
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Password changed.');

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
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByRole('dialog', { name: 'Change password' }).getByLabel('Current password')).toBeVisible();
    await expectAccessible(page);
  });
});

test('M16a: a student changes their password from My account; Admin can still reset it', async ({ page, browser }) => {
  await signIn(page, KID.password, KID.username);
  await expect(page).toHaveURL(/\/student$/);
  await page
    .locator('.me')
    .getByRole('link', { name: /Malis Heng/ })
    .click();
  await expect(page).toHaveURL(/\/student\/account$/);
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible();
  await expect(page.getByText('Ask your teacher or the club admin for a new login slip.')).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Change password' }).click();
  const form = page.getByRole('dialog', { name: 'Change password' }).getByRole('form', { name: 'Change password' });
  await form.getByLabel('Current password').fill(KID.password);
  await form.getByLabel('New password', { exact: true }).fill('panda-rocket-mango');
  await form.getByLabel('New password again').fill('panda-rocket-mango');
  await form.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Password changed.');
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, 'panda-rocket-mango', KID.username);
  await expect(page).toHaveURL(/\/student$/);
  await page.getByRole('button', { name: 'Sign out' }).click();

  // Forgotten: Admin resets it on People, and the slip's password works.
  const admin = await browser.newContext({ storageState: stateFile('admin') });
  const people = await admin.newPage();
  await people.goto('/admin/people?role=student');
  await people
    .getByRole('row', { name: /Malis Heng/ })
    .getByRole('button', { name: 'Reset password' })
    .click();
  const slip = (await people.getByRole('region', { name: 'Login slip' }).getByTestId('slip-password').textContent())!;
  await admin.close();
  await signIn(page, slip, KID.username);
  await expect(page).toHaveURL(/\/student$/);
});

test.describe('student', () => {
  test.use({ storageState: stateFile('student') });
  // Owner, 2026-10-31: the gradient until a picture is chosen; a picture shows in the sidebar; Remove goes back.
  test('sets a profile picture on My account, sees it in the sidebar, and removes it', async ({ page }) => {
    await page.goto('/student/account');
    const preview = page.getByTestId('avatar-preview');
    await expect(preview).toHaveAttribute('style', /linear-gradient/);
    // A photo as a phone makes it: a JPEG, wider than tall, made by the browser itself.
    const photo = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 800;
      c.height = 600;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#e5195e';
      ctx.fillRect(0, 0, 800, 600);
      ctx.fillStyle = '#79b843';
      ctx.fillRect(200, 100, 400, 400);
      return c.toDataURL('image/jpeg', 0.9).split(',')[1]!;
    });
    await page
      .getByLabel('Choose a picture')
      .setInputFiles({ name: 'me.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(photo, 'base64') });
    await expect(page.getByRole('status').filter({ hasText: 'Your picture is saved.' })).toBeVisible();
    const sidebarPicture = page.locator('.me .av img');
    await expect(sidebarPicture).toBeVisible();
    expect((await page.request.get((await sidebarPicture.getAttribute('src'))!)).status()).toBe(200);
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Remove picture' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Your picture is removed.' })).toBeVisible();
    await expect(page.locator('.me .av img')).toHaveCount(0);
  });

  test('can’t open the admin’s or a teacher’s My account', async ({ page }) => {
    for (const path of ['/teacher/account', '/admin/account']) {
      const res = await page.goto(path);
      expect(res?.status()).toBe(403);
    }
  });
});
