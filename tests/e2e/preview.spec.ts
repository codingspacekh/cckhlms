// FR-CODE-04 · NFR-05/06 · ADR 0001: a student's Web page runs on the preview origin with its scripts working,
// console output reaches the LMS, and the page can't reach the LMS, its cookies or the signed-in account.
// These are spike A's isolation tests, now against the real app and the real preview frame.
import { strToU8 } from 'fflate';
import { expect, test, type Page } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { webHomework } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible, watchProblems } from './helpers';

test.describe.configure({ mode: 'serial' });
let w: Awaited<ReturnType<typeof webHomework>>;
test.beforeAll(async () => {
  w = await webHomework();
});
const studentPage = (page: Page) => page.frameLocator('iframe[title="Web page preview"]').frameLocator('#student');
const consolePanel = (page: Page) => page.getByRole('log', { name: 'Console' });
const upload = (page: Page, name: string, content: string) =>
  page.getByLabel('Upload files or .zip').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(strToU8(content)) });

test.describe('student', () => {
  test.use({ storageState: stateFile('student') });

  test('their page runs in the preview: inline scripts, onclick, console, and edits update it', async ({ page }) => {
    const problems = await watchProblems(page);
    await page.goto(`/student/classes/${w.classId}/work/${w.workId}`);
    await expect(studentPage(page).locator('h1')).toHaveText('Hello!'); // the Web template
    await expect(consolePanel(page)).toContainText('› Hello from script.js');

    await upload(
      page,
      'index.html',
      `<!doctype html><html><head><title>t</title></head><body>
<p id="out"></p><button id="btn" onclick="n++; document.getElementById('clicks').textContent = 'clicked ' + n">Click</button>
<p id="clicks"></p>
<script>var n = 0; document.getElementById('out').textContent = 'inline script ran'; console.log('page loaded'); missing();</script>
</body></html>`,
    );
    await expect(studentPage(page).locator('#out')).toHaveText('inline script ran');
    await studentPage(page).locator('#btn').click();
    await expect(studentPage(page).locator('#clicks')).toHaveText('clicked 1');
    await expect(consolePanel(page)).toContainText('› page loaded');
    await expect(consolePanel(page)).toContainText(/error: .*missing is not defined/);

    await page.getByRole('textbox', { name: 'Code for index.html' }).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('<h1>Changed</h1>');
    await expect(studentPage(page).locator('h1')).toHaveText('Changed');
    expect(await problems.cspViolations()).toEqual([]);
    await expectAccessible(page);
  });

  test('their code can’t read LMS cookies, the LMS page, its location, storage, or LMS pages', async ({ page, context }) => {
    await context.addCookies([{ name: 'lms_probe', value: 'secret', domain: 'lms.localhost', path: '/', sameSite: 'Lax' }]);
    await page.goto(`/student/classes/${w.classId}/work/${w.workId}`);
    await upload(
      page,
      'index.html',
      `<script>
const probe = (name, read) => { try { const v = read(); console.log(name + ': READ ' + String(v).slice(0, 40)); } catch (e) { console.log(name + ': blocked'); } };
probe('cookie', () => document.cookie);
probe('parent', () => parent.document.title);
probe('top', () => top.location.href);
probe('storage', () => localStorage.length);
fetch('${E2E.lms}/student', { credentials: 'include' })
  .then((r) => r.text()).then((t) => console.log('fetch: READ ' + t.length))
  .catch(() => console.log('fetch: blocked'));
</script>`,
    );
    const out = consolePanel(page);
    for (const line of ['cookie: blocked', 'parent: blocked', 'top: blocked', 'storage: blocked', 'fetch: blocked'])
      await expect(out).toContainText(line);
    await expect(out).not.toContainText('READ');
  });
});

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('starter files for Web work show the preview too', async ({ page }) => {
    await page.goto(`/teacher/classes/${w.classId}/work/${w.workId}`);
    await expect(studentPage(page).locator('h1')).toHaveText('Hello!');
  });

  test('ADR 0001: mutating LMS routes refuse requests from a sandboxed page (Origin: null) or another site, even with the cookie', async ({
    page,
  }) => {
    for (const origin of ['null', 'https://evil.example']) {
      const upload = await page.request.post('/api/sessions/x/attachments', {
        headers: { origin },
        multipart: { file: { name: 'a.py', mimeType: 'text/plain', buffer: Buffer.from('print(1)') } },
      });
      expect(upload.status(), `upload from ${origin}`).toBe(403);
      const signIn = await page.request.post('/api/auth/sign-in/username', {
        headers: { origin, 'content-type': 'application/json' },
        data: { username: 'sophea', password: 'whatever-password' },
      });
      expect(signIn.status(), `sign-in from ${origin}`).toBe(403);
    }
  });
});
