// FR-CODE-02/03 (ported from spike B): zip import/export in the browser, with path safety and limits.
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { LIMITS, ProjectError } from '@/lib/project/files';
import { exportProject, importZip } from '@/lib/project/zip';

const zipOf = (entries: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(entries).map(([p, c]) => [p, strToU8(c)])));
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof ProjectError ? e.code : `unexpected: ${String(e)}`;
  }
};

describe('zip round trip', () => {
  it('keeps every path and its exact content, including non-Latin text', async () => {
    const files = [
      { path: 'README.md', content: 'Hello ✓ សួស្តី' },
      { path: 'src/com/club/shapes/Main.java', content: 'package com.club.shapes;\n' },
    ];
    expect(await importZip(exportProject(files))).toEqual(files);
  });
  it('normalises backslashes and a leading ./', async () => {
    expect(await importZip(zipOf({ './src\\main.py': 'print(1)' }))).toEqual([{ path: 'src/main.py', content: 'print(1)' }]);
  });
  it('ignores macOS junk entries', async () => {
    const z = zipOf({ 'main.py': 'x = 1', '__MACOSX/._main.py': 'junk', '.DS_Store': 'junk' });
    expect((await importZip(z)).map((f) => f.path)).toEqual(['main.py']);
  });
  it('takes the files out of a single top folder, as IDEs zip them', async () => {
    const z = zipOf({ 'my-project/main.py': 'x', 'my-project/lib/util.py': 'y' });
    expect((await importZip(z)).map((f) => f.path)).toEqual(['lib/util.py', 'main.py']);
  });
});

describe('zip safety', () => {
  it('rejects paths that climb out of the project', async () => {
    expect(await code(importZip(zipOf({ '../evil.py': 'x' })))).toBe('unsafe-path');
    expect(await code(importZip(zipOf({ 'src/../../evil.py': 'x' })))).toBe('unsafe-path');
  });
  it('rejects absolute paths', async () => {
    expect(await code(importZip(zipOf({ '/etc/passwd.txt': 'x' })))).toBe('unsafe-path');
    expect(await code(importZip(zipOf({ 'C:\\evil.py': 'x' })))).toBe('unsafe-path');
  });
  it('rejects file types that are not source code', async () => {
    expect(await code(importZip(zipOf({ 'game.exe': 'MZ' })))).toBe('bad-type');
  });
  it(`rejects more than ${LIMITS.maxFiles} files`, async () => {
    const many = Object.fromEntries(Array.from({ length: LIMITS.maxFiles + 1 }, (_, i) => [`f${i}.py`, 'x']));
    expect(await code(importZip(zipOf(many)))).toBe('too-many-files');
  });
  it(`rejects more than ${LIMITS.maxBytes} bytes of text`, async () => {
    expect(await code(importZip(zipOf({ 'big.py': 'x'.repeat(LIMITS.maxBytes + 1) })))).toBe('too-large');
  });
  it('rejects something that isn’t a zip', async () => {
    expect(await code(importZip(strToU8('not a zip')))).toBe('bad-zip');
  });
  it('refuses to export an unsafe project too', async () => {
    expect(await code(Promise.resolve().then(() => exportProject([{ path: '../x.py', content: '' }])))).toBe('unsafe-path');
  });
});
