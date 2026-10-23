// FR-CODE-02/03: adding files, a folder or pictures from the computer to a project.
import { describe, expect, it, vi } from 'vitest';
import { imageBytes, LIMITS, ProjectError } from '@/lib/project/files';
import { checkPicked, isJunk, MAX_PICKED_IMAGE_BYTES, mergeFiles, placePicked, toProjectFiles } from '@/lib/project/upload';

describe('placePicked', () => {
  it('a project folder gives what’s inside it, keeping its folders', () => {
    const r = placePicked(['my-site/index.html', 'my-site/css/style.css', 'my-site/images/cat.png'], true);
    expect(r).toEqual({ placed: ['index.html', 'css/style.css', 'images/cat.png'], skipped: [] });
    expect(placePicked(['Game/src/com/club/Main.java'], true).placed).toEqual(['src/com/club/Main.java']);
  });
  it('any other folder, like images/, comes in as itself', () => {
    expect(placePicked(['images/cat.png', 'images/dog.jpg'], true).placed).toEqual(['images/cat.png', 'images/dog.jpg']);
  });
  it('leaves out junk quietly, and names the types a project can’t hold', () => {
    const r = placePicked(
      ['site/index.html', 'site/.DS_Store', 'site/.git/config', 'site/Thumbs.db', 'site/notes.docx', 'site/song.mp3'],
      true,
    );
    expect(r).toEqual({ placed: ['index.html', null, null, null, null, null], skipped: ['site/notes.docx', 'site/song.mp3'] });
  });
  it('single files go at the top', () => {
    expect(placePicked(['cat.png', 'game.exe'], false)).toEqual({ placed: ['cat.png', null], skipped: ['game.exe'] });
  });
  it('refuses a path out of the project', () => {
    expect(() => placePicked(['../x.png'], true)).toThrow(ProjectError);
  });
  it('knows junk', () => {
    expect(['__MACOSX/._a.py', '.DS_Store', 'a/.hidden/b.py', 'x/Thumbs.db'].every(isJunk)).toBe(true);
    expect(['./main.py', 'src/main.py'].some(isJunk)).toBe(false);
  });
});

describe('toProjectFiles', () => {
  it('reads code as text and pictures as data: URLs, making only big pictures smaller', async () => {
    const fit = vi.fn(async () => new Uint8Array([9]));
    const small = new Uint8Array([1, 2]);
    const files = await toProjectFiles(
      [
        { path: 'index.html', bytes: new TextEncoder().encode('<p>សួស្តី</p>') },
        { path: 'small.png', bytes: small },
        { path: 'big.jpg', bytes: new Uint8Array(LIMITS.maxImageBytes + 1) },
      ],
      fit,
    );
    expect(files[0]).toEqual({ path: 'index.html', content: '<p>សួស្តី</p>' });
    expect(imageBytes(files[1]!.content)).toEqual(small);
    expect(imageBytes(files[2]!.content)).toEqual(new Uint8Array([9]));
    expect(fit).toHaveBeenCalledTimes(1);
  });
});

describe('checkPicked and mergeFiles', () => {
  it('refuses too many files, or far too many pictures, before reading them', () => {
    const many = Array.from({ length: LIMITS.maxFiles + 1 }, (_, i) => ({ path: `f${i}.py`, size: 1 }));
    expect(() => checkPicked(many)).toThrow(/at most 30 files/);
    expect(() => checkPicked([{ path: 'a.jpg', size: MAX_PICKED_IMAGE_BYTES + 1 }])).toThrow(/MB of pictures/);
    expect(() => checkPicked([{ path: 'a.jpg', size: 5_000_000 }])).not.toThrow(); // made smaller later
  });
  it('replaces files with the same name, whatever the capitals', () => {
    const merged = mergeFiles(
      [
        { path: 'index.html', content: 'old' },
        { path: 'Cat.png', content: 'old' },
      ],
      [{ path: 'cat.png', content: 'new' }],
    );
    expect(merged).toEqual([
      { path: 'index.html', content: 'old' },
      { path: 'cat.png', content: 'new' },
    ]);
  });
});
