// M2 exit journey (docs/05): Admin sets up a term, course and class, adds and enrols students; the student
// and the teacher each see the class and its next session.
import { expect, test, type Page } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { stateFile } from './global-setup';
import { choose, expectAccessible } from './helpers';

test.describe.configure({ mode: 'serial' });
const slips: Record<string, { username: string; password: string }> = {};

test.describe('admin', () => {
  test.use({ storageState: stateFile('admin') });

  test('sets up Term 2 · 2028, a course and a weekend class', async ({ page }) => {
    await page.goto('/admin/terms');
    const t = page.getByRole('form', { name: 'Add a term' });
    await t.getByLabel('Year').fill('2028');
    await choose(t.getByLabel('Term'), '2');
    await t.getByLabel('First day').fill('2028-04-15');
    await t.getByLabel('Last day').fill('2028-07-09');
    await t.getByRole('button', { name: 'Add term' }).click();
    await expect(page.getByRole('row', { name: /Term 2 · 2028/ })).toBeVisible();

    await page.goto('/admin/courses');
    await page.getByRole('button', { name: 'Add a course' }).click();
    const c = page.getByRole('form', { name: 'Add a course' });
    await c.getByLabel('Code').fill('PY2');
    await c.getByLabel('Course name').fill('Python Level 2');
    await choose(c.getByLabel('Language'), 'python');
    await c.getByRole('button', { name: 'Add course' }).click();
    await expect(page.getByRole('row', { name: /PY2/ })).toBeVisible();

    await page.goto('/admin/classes?new=1');
    const f = page.getByRole('form', { name: 'New class' });
    await choose(f.getByLabel('Course'), { label: 'PY2 · Python Level 2' });
    await choose(f.getByLabel('Term'), { label: 'Term 2 · 2028' });
    await f.getByLabel('First session').fill('2028-04-15');
    await choose(f.getByLabel('Lead teacher'), { label: 'Sophea Chan' });
    await f.getByLabel('Room', { exact: true }).fill('Room C');
    await f.getByRole('button', { name: 'Create class' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Python Level 2 · Sat 09:00' })).toBeVisible();
  });

  test('adds two students and enrols them in the class', async ({ page }) => {
    for (const name of ['Kosal Meas', 'Nita Keo']) {
      await page.goto('/admin/people');
      await page.getByRole('button', { name: 'Add a person' }).click();
      const form = page.getByRole('form', { name: 'Add a person' });
      await form.getByLabel('Full name').fill(name);
      await form.getByRole('button', { name: 'Create account' }).click();
      const slip = page.getByRole('region', { name: 'Login slip' });
      await expect(slip).toBeVisible();
      slips[name] = {
        username: (await slip.getByTestId('slip-username').textContent())!,
        password: (await slip.getByTestId('slip-password').textContent())!,
      };
    }

    await page.goto('/admin/classes');
    await page.getByRole('link', { name: 'Python Level 2 · Sat 09:00' }).click();
    const enrol = page.getByRole('form', { name: 'Enrol a student' });
    for (const name of ['Kosal Meas', 'Nita Keo']) {
      // Found by typing part of the name, as on a support line (owner, 2026-10-31).
      await enrol.getByLabel('Find a student').fill(name.split(' ')[0]!.toLowerCase());
      await enrol
        .getByRole('button', { name: `Choose ${name}` })
        .first()
        .click();
      await expect(enrol.getByTestId('chosen-student')).toContainText(name);
      await enrol.getByRole('button', { name: 'Enrol' }).click();
      await expect(page.getByRole('table', { name: 'Students' }).getByRole('row', { name: new RegExp(name) })).toContainText('Active');
    }
    await expectAccessible(page);
  });

  test('withdraws a student, who stays in the history', async ({ page }) => {
    await page.goto('/admin/classes');
    await page.getByRole('link', { name: 'Python Level 2 · Sat 09:00' }).click();
    const row = page.getByRole('table', { name: 'Students' }).getByRole('row', { name: /Nita Keo/ });
    await row.getByRole('button', { name: 'Withdraw' }).click();
    const dialog = page.getByRole('dialog', { name: 'Withdraw Nita Keo' });
    await dialog.getByLabel('Last day in the class').fill('2028-04-20');
    await dialog.getByRole('button', { name: 'Withdraw student' }).click();
    await expect(row).toContainText('Left 20 Apr 2028');
  });
});

async function signIn(page: Page, who: { username: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(who.username);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('the student signs in and sees the class, its next session and teacher', async ({ browser }) => {
  const ctx = await browser.newContext({
    baseURL: E2E.lms,
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { 'cf-connecting-ip': '198.18.1.21' },
  });
  const page = await ctx.newPage();
  await signIn(page, slips['Kosal Meas']!);
  await expect(page).toHaveURL(/\/student$/);
  // M8: the greeting card leads with the next class; the class is in the sidebar under My classes.
  const hello = page.getByRole('region', { name: 'Hi Kosal!' });
  await expect(hello).toContainText('Python Level 2');
  await expect(hello.getByRole('list', { name: 'Next class' })).toContainText('Sat 15 Apr 2028');
  await expect(hello.getByRole('list', { name: 'Next class' })).toContainText('09:00–10:30');
  await expect(hello).toContainText('Room C');
  await expect(hello).toContainText('Teacher Sophea');
  await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: /Python Level 2/ })).toBeVisible();
  await expectAccessible(page);
  await ctx.close();
});

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });
  test('sees the class with its students and next session, and only their own classes', async ({ page }) => {
    await page.goto('/teacher');
    const card = page.getByRole('article', { name: 'Python Level 2 · Sat 09:00' });
    await expect(card).toContainText('1 student');
    await expect(card.getByRole('definition').first()).toHaveText('Sat 15 Apr 2028 · 09:00–10:30Week 1');
    await card.getByRole('link', { name: 'Open class' }).click();
    // the class's sections are in the sidebar
    const sections = page.getByRole('group', { name: 'Python Level 2 · Sat 09:00 sections' });
    await expect(sections.getByRole('link', { name: 'Weeks' })).toHaveAttribute('aria-current', 'page');
    await sections.getByRole('link', { name: 'Students' }).click();
    await expect(page.getByRole('table', { name: 'Students' })).toContainText('Kosal Meas');
    await expectAccessible(page);
    await sections.getByRole('link', { name: 'Schedule' }).click();
    await expect(page.getByRole('table', { name: 'Sessions' })).toBeVisible();
    await expectAccessible(page);
  });
});
