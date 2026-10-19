// Folders are Java packages: src/com/club/shapes/Main.java must say `package com.club.shapes;` (FR-CODE-02).
import type { ProjectFile } from './files';

export type PackageProblem = { path: string; found: string | null; expected: string };

export function expectedPackage(path: string): string {
  const parts = path.replace(/^src\//, '').split('/');
  parts.pop();
  return parts.join('.');
}

const PACKAGE_LINE = /^\s*package\s+([\w.]+)\s*;/m;
function declaredPackage(content: string): string | null {
  const code = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return code.match(PACKAGE_LINE)?.[1] ?? null;
}

export function checkJavaPackages(files: ProjectFile[]): PackageProblem[] {
  return files
    .filter((f) => f.path.endsWith('.java'))
    .map((f) => ({ path: f.path, found: declaredPackage(f.content), expected: expectedPackage(f.path) }))
    .filter((p) => (p.found ?? '') !== p.expected);
}

// A file in the default package has no package line at all.
export function fixPackage(content: string, expected: string): string {
  if (expected === '') return content.replace(/^\s*package\s+[\w.]+\s*;[ \t]*\r?\n(\s*\r?\n)*/m, '');
  if (PACKAGE_LINE.test(content)) return content.replace(PACKAGE_LINE, (line) => line.replace(/package\s+[\w.]+/, `package ${expected}`));
  return `package ${expected};\n\n${content}`;
}
