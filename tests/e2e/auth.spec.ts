// FR-AUTH-01/05/10, ADR-10: sign-in, role areas, 403 for the wrong role, sign-out.
import { expect, test } from '@playwright/test';
import { Pool } from 'pg';
import { E2E } from '../../playwright.config';
import { otherTeachersClass } from './fixtures';
import { stateFile, USERS } from './global-setup';
import { expectAccessible, watchProblems } from './helpers';

test.describe('signed out', () => {
  test('the sign-in page passes an accessibility check', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expectAccessible(page);
  });

  test('a visitor who is not signed in is sent to the sign-in page', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });

  test('a wrong password shows a clear message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('sophea');
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Next.js adds its own (empty) route announcer with role=alert, so look inside the form.
    await expect(page.locator('form').getByRole('alert')).toHaveText('Wrong username or password.');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Admin signs in with a username and lands on the dashboard', async ({ page }) => {
    const problems = await watchProblems(page);
    await page.goto('/login');
    await page.getByLabel('Username').fill(USERS.admin.username);
    await page.getByLabel('Password').fill(USERS.admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    expect(await problems.cspViolations()).toEqual([]);
    expect(problems.consoleErrors).toEqual([]);
  });
});

for (const [who, home] of [
  ['admin', '/admin'],
  ['teacher', '/teacher'],
  ['student', '/student'],
] as const) {
  test.describe(`${who}`, () => {
    test.use({ storageState: stateFile(who) });
    test(`goes to ${home} from the home page, and the page passes an accessibility check`, async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveURL(new RegExp(`${home}$`));
      await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
      await expect(page.locator('.me').getByText(USERS[who].name)).toBeVisible();
      await expectAccessible(page);
    });
  });
}

test.describe('wrong role', () => {
  test.use({ storageState: stateFile('student') });
  test('a student who opens an admin page gets "not allowed" (403)', async ({ page }) => {
    const res = await page.goto('/admin');
    expect(res?.status()).toBe(403);
    await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible();
  });
});

test.describe('not your class', () => {
  test.use({ storageState: stateFile('teacher') });
  test('a teacher who opens another teacher’s class gets "not allowed" (403) on every section', async ({ page }) => {
    const { classId } = await otherTeachersClass();
    for (const section of ['', '/students', '/syllabus', '/schedule', '/gradebook', '/stats', '/reports']) {
      const res = await page.goto(`/teacher/classes/${classId}${section}`);
      expect(res?.status(), section || 'weeks').toBe(403);
    }
    await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible();
  });
});

test.describe('admin dashboard', () => {
  test.use({ storageState: stateFile('admin') });
  test('shows real numbers from the database', async ({ page }) => {
    await page.goto('/admin');
    const tile = (label: string) => page.locator('.tile', { has: page.getByText(label, { exact: true }) });
    // Other specs add classes and students, so compare with the database rather than fixed numbers.
    const pool = new Pool({ connectionString: E2E.databaseUrl });
    const one = async (sql: string) => String((await pool.query(sql)).rows[0].n);
    const classes = await one(
      `select count(*)::int as n from class c join term t on t.id = c.term_id where c.status = 'active' and t.status <> 'closed'`,
    );
    const students = await one(
      `select count(distinct e.student_id)::int as n from enrolment e join class c on c.id = e.class_id join term t on t.id = c.term_id
       where e.status = 'active' and c.status = 'active' and t.status <> 'closed'`,
    );
    await pool.end();
    await expect(tile('Active classes').locator('.v')).toHaveText(classes);
    await expect(tile('Students enrolled').locator('.v')).toHaveText(students);
  });
});

test.describe('sign out', () => {
  test.use({ storageState: stateFile('signout') });
  test('ends the session', async ({ page }) => {
    await page.goto('/teacher');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/teacher');
    await expect(page).toHaveURL(/\/login/);
  });
});
