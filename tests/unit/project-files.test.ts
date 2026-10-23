// FR-CODE-02: the rules every project follows, on the server and in the browser.
import { describe, expect, it } from 'vitest';
import {
  checkNewPath,
  checkProject,
  imageBytes,
  imageDataUrl,
  imageInfo,
  isValidPath,
  languageOf,
  LIMITS,
  normalisePath,
  ProjectError,
} from '@/lib/project/files';

const check = (files: { path: string; content: string }[]) => code(() => checkProject(files));
const code = (fn: () => unknown) => {
  try {
    fn();
    return 'ok';
  } catch (e) {
    return e instanceof ProjectError ? e.code : `unexpected: ${String(e)}`;
  }
};

describe('paths', () => {
  it('normalises and refuses unsafe ones', () => {
    expect(normalisePath('./src//com\\A.java')).toBe('src/com/A.java');
    expect(code(() => normalisePath('../x.py'))).toBe('unsafe-path');
    expect(code(() => normalisePath('/x.py'))).toBe('unsafe-path');
    expect(code(() => normalisePath(''))).toBe('unsafe-path');
  });
  it('accepts plain names in folders, and refuses odd characters', () => {
    expect(isValidPath('src/com/club/Main.java')).toBe(true);
    expect(isValidPath('my game/index.html')).toBe(true);
    expect(isValidPath('a/../b.py')).toBe(false);
    expect(isValidPath('x<y>.py')).toBe(false);
    expect(isValidPath('.hidden.py')).toBe(false);
  });
});

describe('checkProject', () => {
  it('needs at least one file, no duplicates, and only code or text files', () => {
    expect(code(() => checkProject([]))).toBe('empty');
    expect(
      code(() =>
        checkProject([
          { path: 'a.py', content: '' },
          { path: 'a.py', content: '' },
        ]),
      ),
    ).toBe('duplicate');
    expect(code(() => checkProject([{ path: 'a.exe', content: '' }]))).toBe('bad-type');
    expect(code(() => checkProject([{ path: 'main.py', content: 'print(1)' }]))).toBe('ok');
  });
});

// A tiny PNG's first bytes are enough: the rules check the data: URL's type and size, not the pixels.
const png = (bytes: number) => imageDataUrl('a.png', new Uint8Array(bytes).fill(137));

describe('pictures', () => {
  it('are kept as data: URLs of their own type, and come back byte for byte', () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 255, 10, 13]);
    const url = imageDataUrl('cat.png', bytes);
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(imageBytes(url)).toEqual(bytes);
    expect(imageInfo(url)).toEqual({ type: 'image/png', bytes: 8 });
    expect(imageDataUrl('x.JPG', bytes).startsWith('data:image/jpeg;')).toBe(true);
    expect(imageDataUrl('logo.svg', bytes).startsWith('data:image/svg+xml;')).toBe(true);
    const big = new Uint8Array(200_000).map((_, i) => i % 251);
    expect(imageBytes(imageDataUrl('big.webp', big))).toEqual(big); // more than one chunk
  });
  it('can sit beside the code, and don’t count towards its limit', () => {
    const code = { path: 'index.html', content: 'x'.repeat(LIMITS.maxBytes) };
    expect(check([code, { path: 'images/cat.png', content: png(LIMITS.maxImageBytes) }])).toBe('ok');
  });
  it('must be what their name says', () => {
    expect(check([{ path: 'cat.png', content: 'not a picture' }])).toBe('bad-image');
    expect(check([{ path: 'cat.png', content: imageDataUrl('cat.gif', new Uint8Array(4)) }])).toBe('bad-image');
    expect(check([{ path: 'cat.png', content: 'data:image/png;base64,abc' }])).toBe('bad-image');
    expect(check([{ path: 'a.constructor', content: '' }])).toBe('bad-type');
  });
  it(`can be at most ${LIMITS.maxImageBytes / 1024} KB each and ${LIMITS.maxImagesBytes / 1024} KB together`, () => {
    expect(check([{ path: 'a.png', content: png(LIMITS.maxImageBytes + 1) }])).toBe('image-too-large');
    const four = Array.from({ length: 4 }, (_, i) => ({ path: `p${i}.png`, content: png(LIMITS.maxImageBytes) }));
    expect(check(four)).toBe('images-too-large');
    expect(check(four.slice(0, 3))).toBe('ok');
  });
});

describe('languageOf', () => {
  it('knows the club’s languages by extension', () => {
    expect(['main.py', 'A.java', 'index.html', 'style.css', 'app.js', 'data.json', 'notes.txt'].map(languageOf)).toEqual([
      'python',
      'java',
      'html',
      'css',
      'javascript',
      'javascript',
      null,
    ]);
  });
});

describe('checkNewPath (new file or rename)', () => {
  const existing = ['main.py', 'src/com/club/Main.java'];
  it('accepts a new code file anywhere, and tidies the path', () => {
    expect(checkNewPath(existing, 'src/com/club/Player.java')).toEqual({ path: 'src/com/club/Player.java' });
    expect(checkNewPath(existing, ' ./lib\\util.py ')).toEqual({ path: 'lib/util.py' });
  });
  it('explains what is wrong', () => {
    expect(checkNewPath(existing, '')).toEqual({ error: 'Type a file name, for example game.py or src/game/Player.java.' });
    expect(checkNewPath(existing, 'notes')).toEqual({ error: 'Add an extension, for example .py, .java, .html, .css or .js.' });
    expect(checkNewPath(existing, 'Main.PY'.replace('PY', 'exe'))).toMatchObject({
      error: expect.stringMatching(/code, text and picture files/),
    });
    expect(checkNewPath(existing, 'MAIN.py')).toEqual({ error: 'There is already a file called MAIN.py.' });
    expect(checkNewPath(existing, '../x.py')).toMatchObject({ error: expect.stringMatching(/outside the project/) });
    expect(checkNewPath(existing, '.secret.py')).toMatchObject({ error: expect.stringMatching(/can’t start with a dot/) });
    const full = Array.from({ length: LIMITS.maxFiles }, (_, i) => `f${i}.py`);
    expect(checkNewPath(full, 'one-more.py')).toEqual({ error: `A project can have at most ${LIMITS.maxFiles} files.` });
  });
  it('a picture can’t be typed in, and keeps its type when renamed', () => {
    const withPicture = [...existing, 'images/cat.png'];
    expect(checkNewPath(withPicture, 'dog.png')).toMatchObject({ error: expect.stringMatching(/Upload files/) });
    expect(checkNewPath(withPicture, 'main.png', 'main.py')).toMatchObject({ error: expect.stringMatching(/Upload files/) });
    expect(checkNewPath(withPicture, 'images/kitten.png', 'images/cat.png')).toEqual({ path: 'images/kitten.png' });
    expect(checkNewPath(withPicture, 'cat.PNG', 'images/cat.png')).toEqual({ path: 'cat.PNG' });
    expect(checkNewPath(withPicture, 'cat.jpg', 'images/cat.png')).toEqual({
      error: 'Keep the .png ending: renaming can’t change a picture’s type.',
    });
    expect(checkNewPath(withPicture, 'cat.js', 'images/cat.png')).toMatchObject({ error: expect.stringMatching(/Keep the .png/) });
  });
  it('renaming a file to its own name (or new capitals) is fine', () => {
    expect(checkNewPath(existing, 'MAIN.py', 'main.py')).toEqual({ path: 'MAIN.py' });
    expect(checkNewPath(existing, 'main.py', 'main.py')).toEqual({ path: 'main.py' });
  });
});
