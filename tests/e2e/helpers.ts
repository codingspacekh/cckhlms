import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export async function expectAccessible(page: Page) {
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
