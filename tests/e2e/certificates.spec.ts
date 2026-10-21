// FR-ADM-11/12 · FR-STU-08 · BR-05/06: Admin issues certificates to the students who passed; anyone can check a
// code on /verify without signing in; the student downloads their own PDF.
import { expect, test } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { termEndClass } from './fixtures';
import { stateFile } from './global-setup';
import { expectAccessible } from './helpers';

test.describe.configure({ mode: 'serial' });
let c: Awaited<ReturnType<typeof termEndClass>>;
let code = '';
test.beforeAll(async () => {
  c = await termEndClass();
});

test.describe('admin', () => {
  test.use({ storageState: stateFile('admin') });

  test('issues certificates to everyone who passed and downloads one', async ({ page }) => {
    await page.goto('/admin/certificates');
    await expectAccessible(page);
    const row = page.getByRole('row', { name: new RegExp(c.className) });
    await expect(row).toContainText('1 of 2');
    await row.getByRole('link', { name: c.className }).click();

    await expect(page.getByRole('heading', { level: 1, name: c.className })).toBeVisible();
    await expectAccessible(page);
    await expect(page.getByRole('row', { name: /Pich Ros/ }).getByRole('button', { name: 'Issue anyway' })).toBeVisible();
    await page.getByRole('button', { name: 'Issue to everyone who passed (1)' }).click();
    await expect(page.getByRole('status')).toHaveText('1 certificate issued.');

    const nita = page.getByRole('row', { name: /Nita Ung/ });
    code = (await nita.locator('.mono').textContent())!.replace(/-/g, '');
    expect(code).toMatch(/^[0-9A-Z]{26}$/);
    const pdf = await page.request.get((await nita.getByRole('link', { name: 'Download' }).getAttribute('href'))!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });
});

test('anyone can check the code without signing in, however it is typed', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, baseURL: E2E.lms });
  const page = await context.newPage();
  await page.goto(`/verify/${code.toLowerCase().replace(/(.{4})/g, '$1-')}`);
  await expect(page.getByRole('status')).toHaveText('Valid');
  await expect(page.getByText('Nita Ung')).toBeVisible();
  await expect(page.getByText(c.className.split(' · ')[0]!)).toBeVisible();
  await expectAccessible(page);
  expect(await page.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex, nofollow');

  await page.goto('/verify/ABCD2345EFGH6789JKMNPQRSTV');
  await expect(page.getByRole('status')).toHaveText('No certificate has this code. Check that it was typed exactly as printed.');
  await context.close();
});

test.describe('student', () => {
  test.use({ storageState: stateFile('nita') });

  test('downloads their own certificate from My progress', async ({ page }) => {
    await page.goto('/student/progress');
    const mine = page.getByRole('region', { name: 'My certificates' });
    await expect(mine).toContainText('Python Promote');
    const pdf = await page.request.get((await mine.getByRole('link', { name: 'Download PDF' }).getAttribute('href'))!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-disposition']).toContain('Certificate - Nita Ung - Python Promote.pdf');
  });
});
