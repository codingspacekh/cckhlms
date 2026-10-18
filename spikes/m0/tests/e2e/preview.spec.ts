// Spike A (ADR-09) · FR-CODE-04, NFR-06: student web pages run on the preview origin, isolated from the LMS.
import { expect, test } from '@playwright/test';
import { studentFrame, watchProblems } from './helpers';

test('student inline scripts and onclick handlers run in the preview', async ({ page }) => {
  await page.goto('/editor?project=web');
  const frame = studentFrame(page);
  await expect(frame.locator('#out')).toHaveText('inline script ran');
  await frame.locator('#btn').click();
  await expect(frame.locator('#clicks')).toHaveText('clicked 1');
});

test('console output from the student page reaches the LMS console panel', async ({ page }) => {
  await page.goto('/editor?project=web');
  await expect(page.locator('#console')).toContainText('page loaded');
});

test('editing a file updates the preview', async ({ page }) => {
  await page.goto('/editor?project=web');
  await expect(studentFrame(page).locator('h1')).toHaveText("Hi, I'm Bopha");
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('<h1>Changed</h1>');
  await expect(studentFrame(page).locator('h1')).toHaveText('Changed');
});

test('the LMS page has no CSP violations or console errors while the preview runs', async ({ page }) => {
  const problems = await watchProblems(page);
  await page.goto('/editor?project=web');
  await expect(studentFrame(page).locator('#out')).toHaveText('inline script ran');
  await page.locator('.cm-content').click();
  await page.keyboard.type(' ');
  await page.waitForTimeout(800);
  expect(await problems.cspViolations()).toEqual([]);
  expect(problems.consoleErrors).toEqual([]);
});

test('student code cannot read LMS cookies, the LMS page or storage', async ({ page, context }) => {
  await context.addCookies([{ name: 'lms_probe', value: 'secret', domain: 'lms.localhost', path: '/', sameSite: 'Lax' }]);
  await page.goto('/editor?project=probe');
  const out = page.locator('#console');
  for (const line of ['cookie: blocked', 'parent: blocked', 'top: blocked', 'storage: blocked']) await expect(out).toContainText(line);
  await expect(out).not.toContainText('READ');
});

test('student code cannot act as the signed-in user against the LMS', async ({ page, context, request }) => {
  await context.addCookies([{ name: 'lms_probe', value: 'secret', domain: 'lms.localhost', path: '/', sameSite: 'Lax' }]);
  await request.delete('http://localhost:3101/api/spike/echo');
  await page.goto('/editor?project=probe');
  await expect(page.locator('#console')).toContainText('fetch:');
  const seen = (await (await request.get('http://localhost:3101/api/spike/echo')).json()) as { origin: string; hadCookie: boolean; status: number }[];
  expect(seen).toHaveLength(1);
  expect(seen[0].origin).toBe('null');      // the sandboxed student frame has no origin
  expect(seen[0].status).toBe(403);         // so the LMS refuses the request
  expect(seen[0].hadCookie).toBe(false);    // and the browser did not attach the user's cookie
});

test('another website cannot embed the preview frame', async ({ page }) => {
  await page.goto('http://evil.localhost:3102/evil.html');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { readyFromFrame: boolean }).readyFromFrame)).toBe(false);
});
