// FR-CODE-01/02/03/05/06 · ADR 0002: the teacher sets starter files; the student edits a multi-file Java
// project, fixes the package warning, autosaves, and moves the project in and out as a .zip.
import { readFile } from 'node:fs/promises';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { expect, test, type Page } from '@playwright/test';
import { javaHomework } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible, watchProblems } from './helpers';

test.describe.configure({ mode: 'serial' });
let w: Awaited<ReturnType<typeof javaHomework>>;
test.beforeAll(async () => {
  w = await javaHomework();
});
const code = (page: Page, path: string) => page.getByRole('textbox', { name: `Code for ${path}` });
const files = (page: Page) => page.getByRole('navigation', { name: 'Files' });

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('adds a starter file in a package folder and saves the starter files', async ({ page }) => {
    await page.goto(`/teacher/classes/${w.classId}/work/${w.workId}`);
    await expect(files(page).getByRole('button', { name: 'Main.java' })).toHaveAttribute('aria-current', 'true'); // the Java template
    await page.getByRole('button', { name: 'New file' }).click();
    await page.getByRole('form', { name: 'New file' }).getByLabel('File name').fill('src/com/club/shapes/Square.java');
    await page.getByRole('form', { name: 'New file' }).getByRole('button', { name: 'Add' }).click();
    await code(page, 'src/com/club/shapes/Square.java').click();
    await page.keyboard.type('package com.club.shape;\n\npublic class Square {');
    await expect(page.getByTestId('package-warning')).toContainText('but its folder means package com.club.shapes;');
    await page.getByRole('button', { name: 'Save starter files' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe('student', () => {
  test.use({ storageState: stateFile('student') });

  test('gets the starter files, fixes the package with one click, and it is saved', async ({ page }) => {
    const problems = await watchProblems(page);
    await page.goto(`/student/classes/${w.classId}/work/${w.workId}`);
    await files(page).getByRole('button', { name: 'Square.java' }).click();
    await expect(code(page, 'src/com/club/shapes/Square.java')).toContainText('package com.club.shape;');
    await page.getByRole('button', { name: 'Change to package com.club.shapes;' }).click();
    await expect(page.getByTestId('package-warning')).toBeHidden();
    await expect(page.getByTestId('save-state')).toHaveText(/^Saved at \d\d:\d\d$/);

    await page.reload();
    await files(page).getByRole('button', { name: 'Square.java' }).click();
    await expect(code(page, 'src/com/club/shapes/Square.java')).toContainText('package com.club.shapes;');
    await expectAccessible(page);
    expect(await problems.cspViolations()).toEqual([]);
  });

  test('downloads the project as a .zip, refuses an unsafe zip, and opens a zip from an IDE', async ({ page }) => {
    await page.goto(`/student/classes/${w.classId}/work/${w.workId}`);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .zip' }).click()]);
    expect(download.suggestedFilename()).toBe('shapes-with-packages-bopha.l.zip');
    const zip = unzipSync(new Uint8Array(await readFile((await download.path())!)));
    expect(Object.keys(zip).sort()).toEqual(['src/Main.java', 'src/com/club/shapes/Square.java']);
    expect(strFromU8(zip['src/com/club/shapes/Square.java']!)).toContain('package com.club.shapes;');

    const upload = page.getByLabel('Upload files or .zip');
    await upload.setInputFiles({
      name: 'evil.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(zipSync({ '../evil.java': strToU8('x') })),
    });
    await expect(page.getByRole('main').getByRole('alert')).toContainText('outside the project folder'); // Next's route announcer is an alert too
    expect(await files(page).getByRole('button').count()).toBe(2); // nothing changed

    const ide = zipSync({
      'shapes/src/Main.java': strToU8('public class Main {}\n'),
      'shapes/src/Circle.java': strToU8('class Circle {}\n'),
    });
    const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes(`/work/${w.workId}`));
    await upload.setInputFiles({ name: 'shapes.zip', mimeType: 'application/zip', buffer: Buffer.from(ide) });
    await expect(page.getByRole('status').filter({ hasText: 'Opened shapes.zip: 2 files.' })).toBeVisible();
    await expect(files(page).getByRole('button')).toHaveText(['Circle.java', 'Main.java']);
    await saved; // an upload is saved at once, not after the typing pause
    await page.reload();
    await expect(files(page).getByRole('button')).toHaveText(['Circle.java', 'Main.java']);
  });

  test('asks before leaving while a change isn’t saved yet', async ({ page }) => {
    await page.goto(`/student/classes/${w.classId}/work/${w.workId}`);
    await code(page, 'src/Main.java').click();
    await page.keyboard.type('// one more line');
    const asked = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    expect((await asked).type()).toBe('beforeunload');
  });

  test('the editor page stays within the JavaScript budget (ADR 0002: 450 KB gzipped)', async ({ page }) => {
    await page.goto(`/student/classes/${w.classId}/work/${w.workId}`);
    await expect(code(page, 'src/Main.java')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const bytes = await page.evaluate(() =>
      (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
        .filter((r) => r.initiatorType === 'script' || r.name.endsWith('.js'))
        .reduce((n, r) => n + r.encodedBodySize, 0),
    );
    console.log(`editor page JavaScript: ${(bytes / 1024).toFixed(0)} KB`);
    expect(bytes).toBeLessThan(450 * 1024);
  });
});
