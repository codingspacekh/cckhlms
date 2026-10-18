// Spike B (ADR-03) · FR-CODE-02: folders are Java packages; warn when the package line doesn't match.
import { describe, expect, it } from 'vitest';
import { checkJavaPackages, expectedPackage, fixPackage } from '@/lib/java-package';

describe('expectedPackage', () => {
  it('maps folders under src/ to a dotted package', () => {
    expect(expectedPackage('src/com/club/shapes/Main.java')).toBe('com.club.shapes');
  });
  it('works without a src/ folder', () => {
    expect(expectedPackage('com/club/A.java')).toBe('com.club');
  });
  it('is the default package for a file at the top', () => {
    expect(expectedPackage('src/Main.java')).toBe('');
    expect(expectedPackage('Main.java')).toBe('');
  });
});

describe('checkJavaPackages', () => {
  const ok = { path: 'src/com/club/shapes/Main.java', content: 'package com.club.shapes;\n\npublic class Main {}' };

  it('finds no problem when every package matches its folder', () => {
    expect(checkJavaPackages([ok])).toEqual([]);
  });

  it('reports a package line that does not match the folder', () => {
    const bad = { path: 'src/com/club/shapes/Square.java', content: 'package com.club.shape;\nclass Square {}' };
    expect(checkJavaPackages([ok, bad])).toEqual([{ path: bad.path, found: 'com.club.shape', expected: 'com.club.shapes' }]);
  });

  it('reports a missing package line in a sub-folder', () => {
    const bad = { path: 'src/com/club/A.java', content: 'class A {}' };
    expect(checkJavaPackages([bad])).toEqual([{ path: bad.path, found: null, expected: 'com.club' }]);
  });

  it('accepts no package line for a top-level file', () => {
    expect(checkJavaPackages([{ path: 'src/Main.java', content: 'class Main {}' }])).toEqual([]);
  });

  it('ignores a package word inside a comment', () => {
    const f = { path: 'src/com/club/A.java', content: '// package wrong.place;\npackage com.club;\nclass A {}' };
    expect(checkJavaPackages([f])).toEqual([]);
  });

  it('ignores files that are not Java', () => {
    expect(checkJavaPackages([{ path: 'src/notes/readme.md', content: 'package x;' }])).toEqual([]);
  });
});

describe('fixPackage', () => {
  it('replaces a wrong package line', () => {
    expect(fixPackage('package com.club.shape;\nclass S {}', 'com.club.shapes')).toBe('package com.club.shapes;\nclass S {}');
  });
  it('adds a missing package line at the top', () => {
    expect(fixPackage('class A {}', 'com.club')).toBe('package com.club;\n\nclass A {}');
  });
});
