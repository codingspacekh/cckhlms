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
    // far down you were: so try several.
    for (const from of [150, 300, 450, 900]) {
      await page.goto(`/teacher/classes/${c.classId}`);
      await page.evaluate((y) => scrollTo(0, y), from);
      await page.getByRole('region', { name: 'Weeks table' }).getByRole('link', { name: 'Week 2', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Week 2' })).toBeVisible();
      await expect.poll(() => page.evaluate(() => scrollY), { message: `from ${from}px down` }).toBe(0);
    }
  });

  test('the class page’s tables fit without scrolling sideways', async ({ page }) => {
    await page.goto(`/teacher/classes/${c.classId}`);
    await expect(page.getByRole('heading', { name: 'Syllabus coverage' })).toBeVisible();
    expect(await sideways(page)).toEqual([]);
  });
});

test.describe('admin', () => {
  test.use({ storageState: stateFile('admin') });

  for (const path of ['/admin/people', '/admin/courses']) {
    test(`${path} fits without scrolling sideways`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('table')).toBeVisible();
      expect(await sideways(page)).toEqual([]);
    });
  }
});
