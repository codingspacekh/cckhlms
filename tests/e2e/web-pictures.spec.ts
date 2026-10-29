// Pictures in Web projects (owner, 2026-10-23): a student adds a folder with pictures, or a big photo, and the
// preview shows them; autosave doesn't send saved pictures again. In the classmate's Playground, so the other
// specs' projects and drafts stay as they expect.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { teachingClass } from './fixtures';
import { stateFile } from './global-setup';
import { choose, expectAccessible, watchProblems } from './helpers';

test.beforeAll(async () => {
  await teachingClass(); // signs in the classmate
});
test.use({ storageState: stateFile('classmate') });

const preview = (page: Page) => page.frameLocator('iframe[title="Web page preview"]').frameLocator('#student');
const naturalWidth = (page: Page, selector: string) =>
  preview(page)
    .locator(selector)
    .evaluate((img: HTMLImageElement) => (img.complete ? img.naturalWidth : 0));
// A 1×1 PNG.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');

test('a folder with pictures, and a big photo, show in the preview and are saved', async ({ page }) => {
  const problems = await watchProblems(page);
  await page.goto('/student/playground');
  const form = page.getByRole('form', { name: 'New project' });
  await form.getByLabel('Name').fill('Pet page');
  await choose(form.getByLabel('Language'), { label: 'HTML/CSS/JS' });
  await form.getByRole('button', { name: 'Start project' }).click();
  await expect(preview(page).locator('h1')).toHaveText('Hello!');

  // The student's folder, as on their computer.
  const dir = test.info().outputPath('pet-page');
  mkdirSync(join(dir, 'images'), { recursive: true });
  mkdirSync(join(dir, 'css'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><html><head><link rel="stylesheet" href="css/style.css"></head><body><h1>My cat</h1>' +
      '<img id="cat" src="images/cat.png" alt="cat"><div id="bg"></div><script src="app.js"></script></body></html>',
  );
  writeFileSync(join(dir, 'css', 'style.css'), '#bg { width: 10px; height: 10px; background: url(../images/cat.png); }');
  writeFileSync(
    join(dir, 'app.js'),
    'const photo = new Image(); photo.id = "photo"; photo.alt = "my photo"; photo.src = "photo.jpg"; document.body.append(photo);',
  );
  writeFileSync(join(dir, 'images', 'cat.png'), PIXEL);
  writeFileSync(join(dir, '.DS_Store'), 'junk');
  await page.getByLabel('Upload folder').setInputFiles(dir);
  await expect(page.getByRole('status').filter({ hasText: 'Added 4 files from the folder.' })).toBeVisible();
  await expect(preview(page).locator('h1')).toHaveText('My cat');
  await expect.poll(() => naturalWidth(page, '#cat')).toBe(1);
  await expect(preview(page).locator('#bg')).toHaveCSS('background-image', /^url\("data:image\/png;base64,/);

  // A phone photo far over the limit is made smaller in the browser, keeping its name.
  const photo = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 3000;
    c.height = 2000;
    const ctx = c.getContext('2d')!;
    const px = ctx.createImageData(c.width, c.height);
    for (let i = 0; i < px.data.length; i++) px.data[i] = i % 4 === 3 ? 255 : (Math.random() * 256) | 0;
    ctx.putImageData(px, 0, 0);
    return c.toDataURL('image/jpeg', 0.95).split(',')[1]!;
  });
  expect(Buffer.from(photo, 'base64').length).toBeGreaterThan(1024 * 1024);
  await page
    .getByLabel('Upload files or .zip')
    .setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(photo, 'base64') });
  await expect(page.getByRole('status').filter({ hasText: 'Added photo.jpg. Made photo.jpg smaller to fit.' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'The picture photo.jpg' })).toBeVisible();
  await expect.poll(() => naturalWidth(page, '#photo')).toBeGreaterThan(100);
  await expect(page.getByTestId('save-state')).toHaveText(/^Saved at /);
  await expectAccessible(page);

  // Typing saves the code again, but the pictures only by name.
  await page.getByRole('button', { name: 'app.js' }).click();
  await page.getByRole('textbox', { name: 'Code for app.js' }).click();
  const save = page.waitForResponse((r) => r.request().method() === 'POST' && !!r.request().headers()['next-action']);
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' // the end');
  const sent = (await save).request().postDataBuffer()?.length ?? 0;
  expect(sent).toBeGreaterThan(0);
  expect(sent).toBeLessThan(5 * 1024);
  await expect(page.getByTestId('save-state')).toHaveText(/^Saved at /);

  await page.reload();
  await expect.poll(() => naturalWidth(page, '#cat')).toBe(1);
  await expect.poll(() => naturalWidth(page, '#photo')).toBeGreaterThan(100);
  await expect(page.getByRole('button', { name: 'cat.png' })).toBeVisible();
  expect(await problems.cspViolations()).toEqual([]);
});
