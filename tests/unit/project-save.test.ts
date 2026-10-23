// FR-CODE-05: autosave sends pictures the server already has by name only, and the server fills them back in.
import { describe, expect, it } from 'vitest';
import { imageDataUrl, ProjectError } from '@/lib/project/files';
import { filledIn, forSaving, isShortened } from '@/lib/project/save';

const cat = imageDataUrl('cat.png', new Uint8Array([1, 2, 3]));
const dog = imageDataUrl('dog.png', new Uint8Array([4, 5, 6]));
const saved = [
  { path: 'index.html', content: '<img src="cat.png">' },
  { path: 'cat.png', content: cat },
];

describe('forSaving', () => {
  it('sends a saved picture by the path it was saved under, even after a rename', () => {
    const files = [
      { path: 'index.html', content: '<img src="images/kitty.png">' },
      { path: 'images/kitty.png', content: cat },
      { path: 'dog.png', content: dog },
    ];
    const sent = forSaving(files, saved);
    expect(sent).toEqual([files[0], { path: 'images/kitty.png', sameAs: 'cat.png' }, files[2]]);
    expect(isShortened(sent)).toBe(true);
    expect(filledIn(sent, saved)).toEqual(files);
  });
  it('always sends code in full', () => {
    const sent = forSaving(saved, saved);
    expect(sent[0]).toEqual(saved[0]);
    expect(isShortened(forSaving([saved[0]!], saved))).toBe(false);
  });
});

describe('filledIn', () => {
  it('refuses a picture the saved copy doesn’t have (changed in another tab)', () => {
    expect(() => filledIn([{ path: 'cat.png', sameAs: 'gone.png' }], saved)).toThrow(ProjectError);
    expect(() => filledIn([{ path: 'x.png', sameAs: 'index.html' }], saved)).toThrow(ProjectError);
    expect(() => filledIn([{ path: 'x.html', sameAs: 'cat.png' }], saved)).toThrow(ProjectError);
  });
});
