// FR-CODE-07: a student starts a Web project in the Playground, edits it with the live preview, finds it saved after
// a reload, renames and deletes it. Nobody else can open it.
import { devices, expect, test, type Page } from '@playwright/test';
import { teachingClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible, watchProblems } from './helpers';

test.describe.configure({ mode: 'serial' });
let projectUrl = '';
test.beforeAll(async () => {
  await teachingClass(); // signs in the classmate
});
const preview = (page: Page) => page.frameLocator('iframe[title="Web page preview"]').frameLocator('#student');

test.describe('student', () => {
  test.use({ storageState: stateFile('student') });

  test('starts a Web project and sees their page as they type, saved', async ({ page }) => {
    const problems = await watchProblems(page);
    await page.goto('/student');
    await page.getByRole('link', { name: 'Playground' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Playground' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'My projects' })).toContainText('No projects yet.');
    await expectAccessible(page);

    const form = page.getByRole('form', { name: 'New project' });
    await form.getByLabel('Name').fill('My web page');
    await form.getByLabel('Language').selectOption({ label: 'HTML/CSS/JS' });
    await form.getByRole('button', { name: 'Start project' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'My web page' })).toBeVisible();
    projectUrl = new URL(page.url()).pathname;
    expect(projectUrl).toMatch(/^\/student\/playground\/[\w-]+$/);
    await expect(preview(page).locator('h1')).toHaveText('Hello!'); // the Web template

    await page.getByRole('textbox', { name: 'Code for index.html' }).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('<h1>Made in the playground</h1>');
    await expect(preview(page).locator('h1')).toHaveText('Made in the playground');
    await expect(page.getByTestId('save-state')).toHaveText(/^Saved at \d\d:\d\d$/);
    await expectAccessible(page);

    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Code for index.html' })).toContainText('<h1>Made in the playground</h1>');
    expect(await problems.cspViolations()).toEqual([]);
  });

  test('opens it from the list with the editor styled, renames it, then deletes it after confirming', async ({ page }) => {
    // Opened with a link (a client-side navigation), the editor's styles must still get past the CSP.
    const problems = await watchProblems(page);
    await page.goto('/student/playground');
    await page.getByRole('link', { name: 'My web page' }).click();
    await expect(page).toHaveURL(projectUrl);
    await expect(page.locator('.cm-gutters')).toHaveCSS('display', 'flex');
    expect(await problems.cspViolations()).toEqual([]);

    const rename = page.getByRole('form', { name: 'Rename project' });
    await rename.getByLabel('Name').fill('My site');
    await rename.getByRole('button', { name: 'Rename' }).click();
    await expect(rename.getByRole('status')).toHaveText('Renamed to My site.');

    await page.getByRole('link', { name: 'Playground', exact: true }).first().click();
    const row = page.getByRole('row', { name: /My site/ });
    await expect(row).toContainText('HTML/CSS/JS');
    await row.getByRole('button', { name: 'Delete My site' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete project' }).click();
    await expect(page.getByRole('main').getByRole('status')).toHaveText('Deleted My site.');
    await expect(page.getByRole('row', { name: /My site/ })).toHaveCount(0);
  });
});

test('the list fits a phone screen, with the table scrolling inside it', async ({ browser }) => {
  const phone = await (await browser.newContext({ ...devices['Pixel 7'], storageState: stateFile('student') })).newPage();
  await phone.goto('/student/playground');
  await expect(phone.getByRole('table', { name: 'My projects' })).toBeVisible();
  expect(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await phone.context().close();
});

test.describe('someone else', () => {
  test('another student gets "not found" for a project that isn’t theirs', async ({ browser }) => {
    const owner = await (await browser.newContext({ storageState: stateFile('student') })).newPage();
    await owner.goto('/student/playground');
    const form = owner.getByRole('form', { name: 'New project' });
    await form.getByLabel('Name').fill('Secret plans');
    await form.getByRole('button', { name: 'Start project' }).click();
    await expect(owner.getByRole('heading', { level: 1, name: 'Secret plans' })).toBeVisible();
    const url = new URL(owner.url()).pathname;
    await owner.context().close();

    const other = await (await browser.newContext({ storageState: stateFile('classmate') })).newPage();
    expect((await other.goto(url))?.status()).toBe(404);
    await other.context().close();
  });

  test.describe('a teacher', () => {
    test.use({ storageState: stateFile('teacher') });

    test('is not allowed in the Playground', async ({ page }) => {
      expect((await page.goto('/student/playground'))?.status()).toBe(403);
    });
  });
});
