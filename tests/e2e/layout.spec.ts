// Layout on a laptop screen (owner feedback, 2026-10-19): new pages open at the top, and tables fit on one line
// without scrolling sideways.
import { expect, test, type Page } from '@playwright/test';
import { teachingClass, type TeachingClass } from './fixtures';
import { stateFile } from './global-setup';

test.use({ viewport: { width: 1280, height: 720 } });
let c: TeachingClass;
test.beforeAll(async () => {
  c = await teachingClass();
});

// Every TableScroll region whose content is wider than the region itself.
const sideways = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.tw')].filter((t) => t.scrollWidth > t.clientWidth + 1).map((t) => t.getAttribute('aria-label')),
  );

test.describe('teacher', () => {
  test.use({ storageState: stateFile('teacher') });

  test('a link clicked part-way down a long page opens the next page at the top', async ({ page }) => {
    // Next.js alone kept the old position whenever part of the new page was on screen, which depended on how
    // far down you were: so try several, from the long Schedule page, through the sidebar and the page itself.
    const sections = page.getByRole('group', { name: `${c.className} sections` });
    for (const from of [150, 300, 450]) {
      for (const to of ['Students', 'Weeks']) {
        await page.goto(`/teacher/classes/${c.classId}/schedule`);
        await page.evaluate((y) => scrollTo(0, y), from);
        await expect.poll(() => page.evaluate(() => scrollY)).toBe(from);
        await sections.getByRole('link', { name: to }).click();
        await expect(sections.getByRole('link', { name: to })).toHaveAttribute('aria-current', 'page');
        await expect.poll(() => page.evaluate(() => scrollY), { message: `${to} from ${from}px down` }).toBe(0);
      }
    }
    await page.evaluate(() => scrollTo(0, 200));
    await page.getByRole('region', { name: 'Weeks table' }).getByRole('link', { name: 'Week 2', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Week 2' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => scrollY), { message: 'Week 2 from 200px down' }).toBe(0);
  });

  for (const section of ['', '/students', '/stats', '/reports', '/schedule']) {
    test(`the class page${section} fits without scrolling sideways`, async ({ page }) => {
      await page.goto(`/teacher/classes/${c.classId}${section}`);
      // Statistics shows charts (each with a table view behind a button); the other sections lead with a table.
      await expect(
        section === '/stats' ? page.getByRole('heading', { name: 'Attendance by week' }) : page.getByRole('table').first(),
      ).toBeVisible();
      expect(await sideways(page)).toEqual([]);
    });
  }

  test('Back returns to where you were on the previous page', async ({ page }) => {
    await page.goto(`/teacher/classes/${c.classId}/schedule`);
    await page.evaluate(() => scrollTo(0, 450));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(450);
    await page
      .getByRole('group', { name: `${c.className} sections` })
      .getByRole('link', { name: 'Weeks' })
      .click();
    await expect(page.getByRole('heading', { level: 2, name: 'Weeks' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('table', { name: 'Sessions' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(450);
  });
});

test.describe('admin', () => {
  test.use({ storageState: stateFile('admin') });

  test('the Add a person dialog opens in the middle of the screen', async ({ page }) => {
    await page.goto('/admin/people');
    await page.getByRole('button', { name: 'Add a person' }).click();
    const box = (await page.getByRole('dialog', { name: 'Add a person' }).boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - 360)).toBeLessThan(2);
  });

  for (const path of ['/admin/people', '/admin/courses']) {
    test(`${path} fits without scrolling sideways`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('table')).toBeVisible();
      expect(await sideways(page)).toEqual([]);
    });
  }
});
