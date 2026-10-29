// M7 accessibility sweep (NFR-08: WCAG 2.1 AA basics): every screen, for each role, passes axe in light and dark
// mode, fits a phone without scrolling sideways, and can be used from the keyboard (a skip link first, and a
// visible focus ring on everything Tab reaches). It crawls from each role's home through the links on its pages,
// so a new screen is swept without being listed here, and it checks that it reached every page in src/app.
// It makes its own data first (a class with work handed in, term reports, a Playground project), and is named
// zz- so it runs last, when the other specs' classes, reports and certificates are there to see too.
import AxeBuilder from '@axe-core/playwright';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { E2E } from '../../playwright.config';
import { gradingHomework, handIn, m6JourneyClass, teachingClass } from './fixtures';
import { stateFile, USERS } from './global-setup';

// Every page in the app, as a route pattern like /teacher/classes/[id]/weeks/[week].
function routes(dir = join(process.cwd(), 'src/app')): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routes(path);
    if (name !== 'page.tsx') return [];
    const route =
      '/' +
      relative(join(process.cwd(), 'src/app'), dir)
        .split('/')
        .filter((s) => !/^\(.*\)$/.test(s))
        .join('/');
    return [route === '/' ? '/' : route.replace(/\/$/, '')];
  });
}
const ROUTES = routes();
// Static segments win over [dynamic] ones, so /student/playground isn't taken for /student/[x].
const BY_SPECIFICITY = [...ROUTES].sort((a, b) => (a.match(/\[/g)?.length ?? 0) - (b.match(/\[/g)?.length ?? 0));
const patternOf = (path: string) => BY_SPECIFICITY.find((r) => new RegExp(`^${r.replace(/\[[^\]]+\]/g, '[^/]+')}$`).test(path)) ?? null;

async function axe(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0]).analyze();
  return r.violations.map((v) => `${v.id} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
}

// One screen: light and dark, phone width, keyboard. Returns what's wrong with it.
async function sweep(page: Page, url: string, shell: boolean): Promise<string[]> {
  const problems: string[] = [];
  const backgrounds: string[] = [];
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto(url);
    await expect(page).toHaveTitle(/\S/);
    backgrounds.push(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
    for (const v of await axe(page)) problems.push(`${colorScheme}: ${v}`);
  }
  if (backgrounds[0] === backgrounds[1]) problems.push('dark mode: the page looks the same as in light mode');
  await page.emulateMedia({ colorScheme: 'light' });

  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(url);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (wide > 1) problems.push(`phone: scrolls sideways by ${wide}px`);
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.goto(url);
  let reached = 0;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      // Focus is visible if focusing changes how the element, or something inside it, looks: an outline, a shadow,
      // or (in the charts) a stroke on the bar. Compare it focused and blurred; Tab carries on from it either way.
      const look = () =>
        [el, ...el.querySelectorAll('*')]
          .slice(0, 30)
          .map((n) => {
            const s = getComputedStyle(n);
            return [
              s.outlineStyle,
              s.outlineWidth,
              s.outlineColor,
              s.boxShadow,
              s.stroke,
              s.strokeWidth,
              s.backgroundColor,
              s.borderColor,
            ].join('|');
          })
          .join(';');
      const focusedLook = look();
      el.blur();
      const ring = look() !== focusedLook;
      return {
        label: `${el.tagName.toLowerCase()} "${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 30)}"`,
        ring,
        skip: el.classList.contains('skip'),
      };
    });
    if (!focused) break;
    reached++;
    if (i === 0 && shell && !focused.skip) problems.push(`keyboard: the first Tab reaches ${focused.label}, not the skip link`);
    if (!focused.ring) problems.push(`keyboard: no visible focus on ${focused.label}`);
  }
  if (reached === 0 && shell) problems.push('keyboard: Tab reaches nothing');
  return problems.map((p) => `${url} → ${p}`);
}

// Follows the links on each page, one URL per route pattern, from the role's home.
async function crawl(page: Page, home: string, area: string): Promise<Map<string, string>> {
  const seen = new Map<string, string>();
  const queue = [home];
  while (queue.length) {
    const url = queue.shift()!;
    const pattern = patternOf(new URL(url, E2E.lms).pathname);
    if (!pattern || seen.has(pattern)) continue;
    const res = await page.goto(url);
    if (!res || res.status() !== 200 || !new URL(page.url()).pathname.startsWith(area)) continue;
    seen.set(pattern, url);
    const links = await page.$$eval('a[href^="/"]:not([download])', (as) => as.map((a) => a.getAttribute('href')!));
    for (const href of links) {
      const path = new URL(href, E2E.lms).pathname;
      if (path.startsWith(area) && !path.startsWith('/api/')) queue.push(path);
    }
  }
  return seen;
}

async function signedIn(browser: Browser, who: string) {
  const ctx = await browser.newContext({ baseURL: E2E.lms, storageState: stateFile(who), viewport: { width: 1280, height: 720 } });
  return { ctx, page: await ctx.newPage() };
}

// One after another: the last test checks what the others swept, and after a failure the rest are skipped.
test.describe.configure({ mode: 'serial' });
const swept = new Set<string>();

test.beforeAll(async () => {
  const { db } = await import('../../src/db/client');
  const { submission, user } = await import('../../src/db/schema');
  const { eq } = await import('drizzle-orm');
  const { createProject, myProjects } = await import('../../src/modules/playground/playground');
  const { saveLesson } = await import('../../src/modules/teaching/lessons');
  const { weeksOf } = await import('../../src/modules/teaching/weeks');
  const actor = async (u: { username: string; name: string }, role: string) => {
    const [r] = await db.select({ id: user.id }).from(user).where(eq(user.username, u.username));
    return { userId: r!.id, username: u.username, name: u.name, role, sessionId: 'e2e' };
  };
  const [student, teacher] = [await actor(USERS.student, 'student'), await actor(USERS.teacher, 'teacher')];

  const c = await teachingClass();
  const week1 = (await weeksOf(c.classId)).find((w) => w.week === 1)!.id;
  await saveLesson(teacher, week1, {
    title: 'Variables',
    contentMd: 'A **variable** is a name for a value.',
    topicIds: [],
    intent: 'publish',
  });
  // Hand in, unless the grading spec already has (it marks the hand-in, which then can't change).
  const work = await gradingHomework();
  if ((await db.select({ id: submission.id }).from(submission).where(eq(submission.assessmentId, work.workId))).length === 0)
    await handIn(work.workId, USERS.student.name, [{ path: 'main.py', content: 'for i in range(10, -1, -1):\n    print(i)\n' }]);
  await m6JourneyClass();
  if ((await myProjects(student)).length === 0) await createProject(student, { name: 'Sweep page', language: 'web' });
});

for (const [who, area] of [
  ['admin', '/admin'],
  ['teacher', '/teacher'],
  ['student', '/student'],
] as const) {
  test(`every ${who} screen: axe in light and dark, phone width, keyboard`, async ({ browser }) => {
    test.setTimeout(15 * 60_000);
    const { ctx, page } = await signedIn(browser, who);
    const screens = await crawl(page, area, area);
    const problems: string[] = [];
    for (const [pattern, url] of screens) {
      problems.push(...(await sweep(page, url, true)));
      swept.add(pattern);
    }
    await ctx.close();
    expect(problems).toEqual([]);
  });
}

// The crawl sees pages, not dialogs: the M10 edit dialogs are opened here and checked the same way.
test('the edit dialogs (M10): axe in light and dark, and they fit a phone', async ({ browser }) => {
  const { ctx, page } = await signedIn(browser, 'admin');
  const dialogs: [url: string, open: (p: Page) => Promise<void>][] = [
    [
      '/admin/terms',
      (p) =>
        p
          .getByRole('button', { name: /^Edit Term/ })
          .first()
          .click(),
    ],
    [
      '/admin/people',
      (p) =>
        p
          .getByRole('button', { name: /^Edit / })
          .first()
          .click(),
    ],
    [`/admin/classes/${(await teachingClass()).classId}`, (p) => p.getByRole('button', { name: 'Edit class' }).click()],
  ];
  const problems: string[] = [];
  for (const [url, open] of dialogs)
    for (const [mode, width] of [
      ['light', 1280],
      ['dark', 1280],
      ['light', 360],
    ] as const) {
      await page.emulateMedia({ colorScheme: mode });
      await page.setViewportSize({ width, height: 740 });
      await page.goto(url);
      await open(page);
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      for (const v of await axe(page)) problems.push(`${url} ${mode} ${width}: ${v}`);
      const wide = await dialog.evaluate((d) => d.scrollWidth - d.clientWidth);
      if (wide > 1) problems.push(`${url} at ${width}px: the dialog scrolls sideways by ${wide}px`);
    }
  await ctx.close();
  expect(problems).toEqual([]);
});

test('the public pages, and every page in the app was swept', async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const ctx = await browser.newContext({ baseURL: E2E.lms, storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  const problems = [...(await sweep(page, '/login', false)), ...(await sweep(page, '/verify/0000000000000000000000000A', false))];
  for (const r of ['/login', '/verify/[code]']) swept.add(r);
  await ctx.close();
  expect(problems).toEqual([]);
  // `/` only redirects to the person's home or the sign-in page.
  expect(ROUTES.filter((r) => r !== '/' && !swept.has(r))).toEqual([]);
});
