// FR-CODE-02/03 (ported from spike B): zip import/export in the browser, with path safety and limits.
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { imageBytes, imageDataUrl, LIMITS, ProjectError } from '@/lib/project/files';
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
  it('keeps pictures as their own bytes in the zip, and reads them back', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 255]);
    const files = [
      { path: 'images/cat.png', content: imageDataUrl('images/cat.png', bytes) },
      { path: 'index.html', content: '<img src="images/cat.png">' },
    ];
    const zip = exportProject(files);
    expect(unzipSync(zip)['images/cat.png']).toEqual(bytes);
    expect(await importZip(zip)).toEqual(files);
  });
  it('makes big pictures smaller with fit, or refuses them without it', async () => {
    const z = zipSync({ 'index.html': strToU8(''), 'big.jpg': new Uint8Array(LIMITS.maxImagesBytes + 1) });
    expect(await code(importZip(z))).toBe('images-too-large');
    const fit = async () => new Uint8Array([1, 2, 3]);
    const files = await importZip(z, fit);
    expect(imageBytes(files.find((f) => f.path === 'big.jpg')!.content)).toEqual(new Uint8Array([1, 2, 3]));
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
