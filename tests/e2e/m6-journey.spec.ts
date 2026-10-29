// M6 exit journey (docs/05): end of term → the teacher publishes the term reports → Admin promotes the class (the
// passed student to the next level, the other to a repeat class) → Admin issues the certificate → a phone scans
// the QR code on the PDF, opens the verify link and sees "Valid" → the audit log shows who did each step.
import { devices, expect, test, type Browser } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { readQrCode } from '../qr';
import { m6JourneyClass } from './fixtures';
import { stateFile } from './global-setup';
import { choose, expectAccessible } from './helpers';

test.describe.configure({ mode: 'serial' });
let c: Awaited<ReturnType<typeof m6JourneyClass>>;
let pdf: Buffer;
const as = async (browser: Browser, who: string) =>
  (await browser.newContext({ storageState: stateFile(who), baseURL: E2E.lms })).newPage();
test.beforeAll(async () => {
  c = await m6JourneyClass();
});

test('the teacher publishes the term reports', async ({ browser }) => {
  const page = await as(browser, 'teacher');
  await page.goto(`/teacher/classes/${c.classId}/reports`);
  await page.getByRole('button', { name: 'Publish reports' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish 2 reports' }).click();
  await expect(page.getByRole('status')).toHaveText('2 reports published.');
  await page.context().close();
});

test('Admin promotes the class, then issues the certificate', async ({ browser }) => {
  const page = await as(browser, 'admin');
  await page.goto('/admin/promotion');
  await page
    .getByRole('row', { name: new RegExp(c.className) })
    .getByRole('link', { name: 'Open wizard' })
    .click();
  await choose(page.getByLabel('Passed (1) move to', { exact: true }), { label: c.next });
  await choose(page.getByLabel('Not passed (1) move to', { exact: true }), { label: c.repeat });
  await page.getByRole('button', { name: 'Confirm promotion' }).click();
  await expect(page.getByRole('status')).toHaveText('Done: 2 students moved on. The class is archived.');

  await page.goto('/admin/certificates');
  await page
    .getByRole('row', { name: new RegExp(c.className) })
    .getByRole('link', { name: c.className })
    .click();
  await page.getByRole('button', { name: 'Issue to everyone who passed (1)' }).click();
  await expect(page.getByRole('status')).toHaveText('1 certificate issued.');
  await expect(page.getByRole('row', { name: new RegExp(c.failed) }).getByRole('button', { name: 'Issue anyway' })).toBeVisible();
  const link = page.getByRole('row', { name: new RegExp(c.passed) }).getByRole('link', { name: 'Download' });
  const res = await page.request.get((await link.getAttribute('href'))!);
  expect(res.headers()['content-type']).toBe('application/pdf');
  pdf = await res.body();
  await page.context().close();
});

test('a phone scans the QR code on the certificate and sees it is valid', async ({ browser }) => {
  const url = readQrCode(pdf);
  expect(url).toMatch(new RegExp(`^${E2E.lms}/verify/[0-9A-Z]{26}$`));
  const phone = await browser.newContext({ ...devices['Pixel 7'], storageState: { cookies: [], origins: [] } });
  const page = await phone.newPage();
  await page.goto(url!);
  await expect(page.getByRole('status')).toHaveText('Valid');
  await expect(page.getByText(c.passed)).toBeVisible();
  await expect(page.getByText('Python Finale', { exact: true })).toBeVisible();
  await expectAccessible(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await phone.close();
});

test('the audit log shows who published, promoted and issued', async ({ browser }) => {
  const page = await as(browser, 'admin');
  await page.goto(`/admin/audit?person=${encodeURIComponent(c.passed)}`);
  const log = page.getByRole('table', { name: 'Audit log' });
  await expect(log.getByRole('row', { name: /Issued a certificate/ })).toContainText(`${c.passed} · ${c.className}`);
  await expect(log.getByRole('row', { name: /Published a term report/ })).toContainText('Result: Pass · 85');

  await choose(page.getByLabel('What'), { label: 'Promotion' });
  await page.getByLabel('Person').fill('');
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(page).toHaveURL(/group=promotion/);
  const promoted = log.getByRole('row', { name: new RegExp(c.className) });
  await expect(promoted).toContainText('Promoted a class');
  await expect(promoted).toContainText(`${c.passed}: Pass → ${c.next}`);
  await expect(promoted).toContainText(`${c.failed}: Fail → ${c.repeat}`);
  await expectAccessible(page);
  await page.context().close();
});
