// FR-TCH-01 · NFR-05: the teacher attaches files to a lesson and shows an image in the note; the student opens
// them. Files only reach the class, and nothing uploaded can run on the LMS origin.
import { expect, test } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { teachingClass, type TeachingClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible, watchProblems, writeNote } from './helpers';

test.describe.configure({ mode: 'serial' });
let c: TeachingClass;
const fileIds: Record<string, string> = {};
// A 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test.beforeAll(async () => {
  c = await teachingClass();
});

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('saves week 6, attaches files, and shows the image in the note', async ({ page }) => {
    await page.goto(`/teacher/classes/${c.classId}/weeks/6`);
    await expect(page.getByText('Save the lesson first, then add files to it.')).toBeVisible();
    const form = page.getByRole('form', { name: 'Lesson note' });
    await form.getByLabel('Title').fill('Functions');
    await writeNote(page, 'Today: functions.');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('status')).toContainText('Draft saved');

    const files = page.getByRole('region', { name: 'Files' });
    await files.getByLabel('Add files').setInputFiles([
      { name: 'diagram.png', mimeType: 'image/png', buffer: PNG },
      { name: 'page.html', mimeType: 'text/html', buffer: Buffer.from('<script>parent.alert(1)</script>') },
    ]);
    await files.getByRole('button', { name: 'Upload' }).click();
    await expect(files.getByRole('status')).toHaveText('2 files added.');
    const list = files.getByRole('list', { name: 'Lesson files' });
    for (const name of ['diagram.png', 'page.html']) {
      const href = await list.getByRole('link', { name }).getAttribute('href');
      fileIds[name] = href!.split('/').pop()!;
    }
    await expectAccessible(page);

    await files.getByLabel('Add files').setInputFiles({ name: 'setup.exe', mimeType: 'application/octet-stream', buffer: PNG });
    await files.getByRole('button', { name: 'Upload' }).click();
    await expect(files.getByRole('alert')).toContainText('setup.exe can’t be attached');

    const snippet = (await files.locator('code').first().textContent())!;
    await writeNote(page, `Today: functions.\n\n${snippet}`);
    await expect(form.getByRole('textbox', { name: 'Lesson note' }).getByRole('img', { name: 'diagram.png' })).toHaveAttribute(
      'src',
      `/api/files/${fileIds['diagram.png']}`,
    );
    await form.getByRole('button', { name: 'Student view' }).click();
    await expect(
      form.getByRole('region', { name: 'Student view' }).getByRole('figure', { name: 'diagram.png' }).locator('img'),
    ).toHaveAttribute('src', `/api/files/${fileIds['diagram.png']}`);
    await page.getByRole('region', { name: 'Publish' }).getByRole('button', { name: 'Publish now' }).click();
    await expect(page.getByRole('status').first()).toContainText('Lesson published');
  });

  test('uploads are refused from another site', async ({ page }) => {
    const res = await page.request.post(`/api/sessions/x/attachments`, {
      headers: { origin: 'https://evil.example' },
      multipart: { file: { name: 'a.py', mimeType: 'text/plain', buffer: Buffer.from('print(1)') } },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('student', () => {
  test.use({ storageState: stateFile('student') });

  test('sees the image in the note and the files list, and opens a file', async ({ page }) => {
    const problems = await watchProblems(page);
    await page.goto(`/student/classes/${c.classId}/weeks/6`);
    // A picture on its own line is a figure named by its caption (FR-STU-12).
    const img = page.getByRole('article', { name: 'Lesson note' }).getByRole('figure', { name: 'diagram.png' }).locator('img');
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
    const list = page.getByRole('list', { name: 'Lesson files' });
    await expect(list.getByRole('link')).toHaveText(['diagram.png', 'page.html']);
    expect(await problems.cspViolations()).toEqual([]);
  });

  test('an uploaded web page downloads as a file, sandboxed, and never runs', async ({ page }) => {
    const res = await page.request.get(`/api/files/${fileIds['page.html']}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('text/plain; charset=utf-8');
    expect(res.headers()['content-disposition']).toMatch(/^attachment; filename="page.html"/);
    expect(res.headers()['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });
});

test('files are not found for people outside the class, or signed out', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, baseURL: E2E.lms });
  expect((await ctx.request.get(`/api/files/${fileIds['diagram.png']}`)).status()).toBe(404);
  await ctx.close();
  const admin = await browser.newContext({ storageState: stateFile('admin'), baseURL: E2E.lms });
  expect((await admin.request.get(`/api/files/${fileIds['diagram.png']}`)).status()).toBe(200); // admins may read lessons
  await admin.close();
});
