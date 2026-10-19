// FR-CODE-02: the rules every project follows, on the server and in the browser.
import { describe, expect, it } from 'vitest';
import { checkNewPath, checkProject, isValidPath, languageOf, LIMITS, normalisePath, ProjectError } from '@/lib/project/files';

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
    expect(checkNewPath(existing, 'Main.PY'.replace('PY', 'exe'))).toMatchObject({ error: expect.stringMatching(/code and text files/) });
    expect(checkNewPath(existing, 'MAIN.py')).toEqual({ error: 'There is already a file called MAIN.py.' });
    expect(checkNewPath(existing, '../x.py')).toMatchObject({ error: expect.stringMatching(/outside the project/) });
    expect(checkNewPath(existing, '.secret.py')).toMatchObject({ error: expect.stringMatching(/can’t start with a dot/) });
    const full = Array.from({ length: LIMITS.maxFiles }, (_, i) => `f${i}.py`);
    expect(checkNewPath(full, 'one-more.py')).toEqual({ error: `A project can have at most ${LIMITS.maxFiles} files.` });
  });
  it('renaming a file to its own name (or new capitals) is fine', () => {
    expect(checkNewPath(existing, 'MAIN.py', 'main.py')).toEqual({ path: 'MAIN.py' });
    expect(checkNewPath(existing, 'main.py', 'main.py')).toEqual({ path: 'main.py' });
  });
});
