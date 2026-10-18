import type { Page } from '@playwright/test';

// Records CSP violations and console errors of the top-level LMS document only.
export async function watchProblems(page: Page) {
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && page.mainFrame() === m.page()?.mainFrame()) consoleErrors.push(m.text()); });
  await page.addInitScript(() => {
    if (window.top !== window) return;
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI} @ ${e.sourceFile}:${e.lineNumber}:${e.columnNumber} ${e.sample}`);
    });
  });
  return {
    cspViolations: () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp),
    consoleErrors,
  };
}

export const studentFrame = (page: Page) => page.frameLocator('#preview').frameLocator('#student');
