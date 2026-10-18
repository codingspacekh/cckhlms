// Spike B (ADR-03) · FR-CODE-02/03: zip import/export in the browser, with path safety and limits.
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportProject, importZip, LIMITS, ProjectError } from '@/lib/zip';

const zipOf = async (entries: Record<string, string>) => {
  const z = new JSZip();
  for (const [p, c] of Object.entries(entries)) z.file(p, c);
  return z.generateAsync({ type: 'uint8array' });
};
const code = async (p: Promise<unknown>) => {
  try { await p; return 'ok'; } catch (e) { return e instanceof ProjectError ? e.code : `unexpected: ${String(e)}`; }
};

describe('zip round trip', () => {
  it('keeps every path and its exact content, including non-Latin text', async () => {
    const files = [
      { path: 'README.md', content: 'Hello ✓ សួស្តី' },
      { path: 'src/com/club/shapes/Main.java', content: 'package com.club.shapes;\n' },
    ];
    expect(await importZip(await exportProject(files))).toEqual(files);
  });

  it('normalises backslashes and a leading ./', async () => {
    const z = await zipOf({ './src\\main.py': 'print(1)' });
    expect(await importZip(z)).toEqual([{ path: 'src/main.py', content: 'print(1)' }]);
  });

  it('ignores macOS junk entries', async () => {
    const z = await zipOf({ 'main.py': 'x = 1', '__MACOSX/._main.py': 'junk', '.DS_Store': 'junk' });
    expect((await importZip(z)).map((f) => f.path)).toEqual(['main.py']);
  });
});

describe('zip safety', () => {
  it('rejects paths that climb out of the project', async () => {
    expect(await code(importZip(await zipOf({ '../evil.py': 'x' })))).toBe('unsafe-path');
    expect(await code(importZip(await zipOf({ 'src/../../evil.py': 'x' })))).toBe('unsafe-path');
  });

  it('rejects absolute paths', async () => {
    expect(await code(importZip(await zipOf({ '/etc/passwd.txt': 'x' })))).toBe('unsafe-path');
    expect(await code(importZip(await zipOf({ 'C:\\evil.py': 'x' })))).toBe('unsafe-path');
  });

  it('rejects file types that are not source code', async () => {
    expect(await code(importZip(await zipOf({ 'game.exe': 'MZ' })))).toBe('bad-type');
  });

  it(`rejects more than ${LIMITS.maxFiles} files`, async () => {
    const many = Object.fromEntries(Array.from({ length: LIMITS.maxFiles + 1 }, (_, i) => [`f${i}.py`, 'x']));
    expect(await code(importZip(await zipOf(many)))).toBe('too-many-files');
  });

  it(`rejects more than ${LIMITS.maxBytes} bytes of text`, async () => {
    expect(await code(importZip(await zipOf({ 'big.py': 'x'.repeat(LIMITS.maxBytes + 1) })))).toBe('too-large');
  });

  it('refuses to export an unsafe project too', async () => {
    expect(await code(exportProject([{ path: '../x.py', content: '' }]))).toBe('unsafe-path');
  });
});
