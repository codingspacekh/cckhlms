import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

export async function expectAccessible(page: Page) {
  // After a Server Action the router re-renders the page and React briefly swaps the <title>; wait it out
  // so axe doesn't catch the gap (a page with no title still fails here, by timing out).
  await expect(page).toHaveTitle(/\S/);
  // @axe-core/playwright ships its own (slightly older) Playwright Page type.
  const results = await new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

// CSP violations and console errors of the top-level document.
export async function watchProblems(page: Page) {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      w.__csp.push(`${e.violatedDirective} ${e.blockedURI} @ ${e.sourceFile}:${e.lineNumber}`),
    );
  });
  return { cspViolations: () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp), consoleErrors };
}

// Writes a lesson note in the editor (M9) by pasting Markdown over what's there, as a teacher pasting a note they
// kept elsewhere would. Typing and the toolbar are tested in lessons.spec.ts.
// Writes into the note editor by pasting Markdown, which it turns into formatting: the lesson note, or (M12) a
// question or reply by its label.
export async function writeNote(page: Page, markdown: string, label = 'Lesson note') {
  const doc = page.getByRole('textbox', { name: label, exact: true });
  await doc.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await doc.evaluate((el, md) => {
    const data = new DataTransfer();
    data.setData('text/plain', md);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, markdown);
}

// Picks an option in the club's drop-down (src/components/ui/Select.tsx), as selectOption did on a <select>: by
// value or label, or by { label }. It waits for the page's JavaScript first: until then the browser's own select
// stands in, and its list isn't ours.
export async function choose(field: Locator, option: string | { label: string }) {
  await expect(field).toHaveAttribute('aria-haspopup', 'listbox');
  await field.click();
  await expect(field).toHaveAttribute('aria-expanded', 'true');
  const list = field.page().locator(`[id="${await field.getAttribute('aria-controls')}"]`);
  const pick =
    typeof option === 'string'
      ? list.locator(`[role=option][data-value="${option}"]`).or(list.getByRole('option', { name: option, exact: true }))
      : list.getByRole('option', { name: option.label, exact: true });
  await pick.first().click();
  await expect(list).toBeHidden();
}
