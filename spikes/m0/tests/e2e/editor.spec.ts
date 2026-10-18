// Spike B (ADR-03) · FR-CODE-01/02/03, NFR-02: multi-file editor speed, package check, zip in the browser.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { expect, test } from '@playwright/test';

const metrics: Record<string, unknown> = {};
test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/m0-editor-metrics.json', JSON.stringify(metrics, null, 2));
});

test('a 30-file Java project opens and typing stays fast with the CPU slowed 4×', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU_RATE ?? 4) });
  await page.goto('/editor?project=java30');
  await expect(page.getByTestId('file')).toHaveCount(30);

  for (const n of [3, 11, 19, 27, 29]) await page.getByTestId('file').nth(n).click();
  await page.locator('.cm-content').click();
  await page.evaluate(() => {
    const w = window as unknown as { __ev: number[] };
    w.__ev = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (['keydown', 'keypress', 'keyup', 'input', 'beforeinput'].includes(e.name)) w.__ev.push(e.duration);
    }).observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit);
  });
  const typed = 'int total = step1(2) + step2(3);\n'.repeat(6);
  await page.keyboard.type(typed, { delay: 30 });
  await page.waitForTimeout(500);
  const slow = (await page.evaluate(() => (window as unknown as { __ev: number[] }).__ev)).sort((a, b) => a - b);
  // Each keystroke fires 5 events (keydown, keypress, beforeinput, input, keyup). Events under 16 ms are not
  // reported, so they count as fast. Event Timing durations include the time until the next paint.
  const total = Math.max(typed.length * 5, slow.length);
  const fast = total - slow.length;
  const pct = (q: number) => { const i = Math.ceil(total * q) - fast - 1; return i < 0 ? 0 : slow[i]; };
  const p95 = pct(0.95);
  metrics.typing = { keystrokes: typed.length, events: total, eventsOver16ms: slow.length, p50ms: pct(0.5), p95ms: p95, maxMs: slow.at(-1) ?? 0, cpuThrottle: `${process.env.CPU_RATE ?? 4}x` };
  expect(p95).toBeLessThan(50);
});

test('the editor page JavaScript stays within budget', async ({ page }) => {
  let bytes = 0;
  page.on('response', async (r) => {
    if (r.request().resourceType() === 'script') bytes += (await r.request().sizes()).responseBodySize;
  });
  await page.goto('/editor?project=java');
  await page.waitForLoadState('networkidle');
  metrics.editorPageScriptKB = Math.round(bytes / 1024);
  expect(bytes).toBeLessThan(450 * 1024);
});

test('a wrong Java package line shows a warning with a one-click fix', async ({ page }) => {
  await page.goto('/editor?project=java');
  await page.getByTestId('file').filter({ hasText: 'Square.java' }).click();
  await expect(page.getByTestId('pkg-warning')).toContainText('com.club.shapes');
  await page.getByTestId('pkg-fix').click();
  await expect(page.getByTestId('pkg-warning')).toHaveCount(0);
  await expect(page.locator('.cm-content')).toContainText('package com.club.shapes;');
});

test('download produces a zip with the project files', async ({ page }) => {
  await page.goto('/editor?project=java');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .zip' }).click()]);
  const zip = await JSZip.loadAsync(readFileSync((await download.path())!));
  expect(Object.keys(zip.files).filter((p) => !zip.files[p].dir).sort()).toEqual(['src/com/club/shapes/Main.java', 'src/com/club/shapes/Square.java']);
});

test('uploading a zip with an unsafe path is refused with a clear message', async ({ page }) => {
  await page.goto('/editor?project=python');
  const z = new JSZip();
  z.file('../evil.py', 'x');
  await page.getByLabel('Upload .zip').setInputFiles({ name: 'evil.zip', mimeType: 'application/zip', buffer: Buffer.from(await z.generateAsync({ type: 'uint8array' })) });
  await expect(page.getByTestId('zip-error')).toContainText('outside the project');
  await expect(page.getByTestId('file')).toHaveCount(1);
});
