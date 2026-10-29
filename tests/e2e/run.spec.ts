// M11 · FR-CODE-09/10: a student runs Python with input and Java in the Playground, on the real runner (CI starts it;
// on a laptop `npm run runner:up`). Prototype boards 1–2.
import { expect, test } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { stateFile } from './global-setup';
import { choose, expectAccessible } from './helpers';

test.use({ storageState: stateFile('student') });
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const ok = await fetch(`${E2E.runner}/health`)
    .then((r) => r.ok)
    .catch(() => false);
  expect(ok, `No code runner at ${E2E.runner}: start it with "npm run runner:up"`).toBe(true);
});

async function newProject(page: import('@playwright/test').Page, name: string, language: string) {
  await page.goto('/student/playground');
  const form = page.getByRole('form', { name: 'New project' });
  await form.getByLabel('Name').fill(name);
  await choose(form.getByLabel('Language'), { label: language });
  await form.getByRole('button', { name: 'Start project' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test('runs a Python program with the Input box, showing the lines it read', async ({ page }) => {
  await newProject(page, 'Greeter', 'Python');
  const code = page.getByRole('textbox', { name: 'Code for main.py' });
  await code.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('name = input("Name? ")\nprint("Hi", name + "!")');
  const run = page.getByRole('region', { name: 'Run' });
  await run.getByLabel(/^Input/).fill('Dara');
  await run.getByRole('button', { name: 'Run' }).click();
  await expect(run.getByRole('status')).toHaveText(/^Finished in \d+\.\d s$/, { timeout: 30_000 });
  const output = run.getByRole('log', { name: 'Output' });
  await expect(output).toHaveText('Name? Dara\nHi Dara!\n');
  await expect(output.locator('.run-in')).toHaveText('Dara');
  await expectAccessible(page);
});

test('runs Java, then shows a compile error and goes to its line', async ({ page }) => {
  await newProject(page, 'Hello Java', 'Java');
  const run = page.getByRole('region', { name: 'Run' });
  await run.getByRole('button', { name: 'Run' }).click();
  await expect(run.getByRole('log', { name: 'Output' })).toHaveText('Hello!\n', { timeout: 30_000 });
  await expect(run).toContainText('Java 21 · runs Main');

  // Take the semicolon off line 3, System.out.println("Hello!");
  const code = page.getByRole('textbox', { name: 'Code for src/Main.java' });
  await code.click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await run.getByRole('button', { name: 'Run' }).click();
  await expect(run.getByRole('status')).toHaveText('Didn’t compile', { timeout: 30_000 });
  await expect(run.getByRole('log', { name: 'Output' })).toContainText("src/Main.java:3: error: ';' expected");
  await run.getByRole('button', { name: 'Go to line 3 of Main.java' }).click();
  await expect(code).toBeFocused();
  await expectAccessible(page);
});
