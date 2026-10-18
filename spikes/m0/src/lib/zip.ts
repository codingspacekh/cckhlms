// Zip import/export in the browser (FR-CODE-03). Checks every path so a zip can't write outside the project.
// fflate, not JSZip: JSZip's bundled Node polyfills call Function() and trip the strict CSP (M0 finding).
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { ProjectFile } from './spike-projects';

export const LIMITS = { maxFiles: 30, maxBytes: 200 * 1024 };
export const ALLOWED_EXTENSIONS = ['py', 'java', 'html', 'htm', 'css', 'js', 'json', 'txt', 'md', 'csv'];

export type ProjectErrorCode = 'unsafe-path' | 'bad-type' | 'too-many-files' | 'too-large' | 'bad-zip';
const MESSAGES: Record<ProjectErrorCode, string> = {
  'unsafe-path': 'This zip has a file outside the project folder (for example "../"). Remove it and try again.',
  'bad-type': `Only code and text files can be added (${ALLOWED_EXTENSIONS.join(', ')}).`,
  'too-many-files': `A project can have at most ${LIMITS.maxFiles} files.`,
  'too-large': `A project can have at most ${LIMITS.maxBytes / 1024} KB of code.`,
  'bad-zip': 'That file is not a zip we can open.',
};

export class ProjectError extends Error {
  constructor(public readonly code: ProjectErrorCode, detail?: string) {
    super(detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code]);
  }
}

const isJunk = (p: string) => p.startsWith('__MACOSX/') || p.split('/').pop() === '.DS_Store';

export function normalisePath(raw: string): string {
  const p = raw.replace(/\\/g, '/');
  if (p.startsWith('/') || /^[a-zA-Z]:\//.test(p)) throw new ProjectError('unsafe-path', raw);
  const parts = p.split('/').filter((s) => s !== '' && s !== '.');
  if (parts.some((s) => s === '..') || parts.length === 0) throw new ProjectError('unsafe-path', raw);
  return parts.join('/');
}

function checkProject(files: ProjectFile[]) {
  if (files.length > LIMITS.maxFiles) throw new ProjectError('too-many-files');
  let bytes = 0;
  for (const f of files) {
    const ext = f.path.split('.').pop()?.toLowerCase() ?? '';
    if (!f.path.includes('.') || !ALLOWED_EXTENSIONS.includes(ext)) throw new ProjectError('bad-type', f.path);
    bytes += new TextEncoder().encode(f.content).length;
  }
  if (bytes > LIMITS.maxBytes) throw new ProjectError('too-large');
}

export async function exportProject(files: ProjectFile[]): Promise<Uint8Array> {
  for (const f of files) if (normalisePath(f.path) !== f.path) throw new ProjectError('unsafe-path', f.path);
  checkProject(files);
  return zipSync(Object.fromEntries(files.map((f) => [f.path, strToU8(f.content)])), { level: 6 });
}

export async function importZip(data: Uint8Array | ArrayBuffer): Promise<ProjectFile[]> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let count = 0;
  let declared = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      // Runs before anything is decompressed, so an oversized zip ("zip bomb") is refused cheaply.
      filter: (f) => {
        if (f.name.endsWith('/') || isJunk(f.name.replace(/\\/g, '/'))) return false;
        if (++count > LIMITS.maxFiles) throw new ProjectError('too-many-files');
        if ((declared += f.originalSize) > LIMITS.maxBytes) throw new ProjectError('too-large');
        return true;
      },
    });
  } catch (e) {
    if (e instanceof ProjectError) throw e;
    throw new ProjectError('bad-zip');
  }
  const files = Object.entries(entries).map(([name, u8]) => ({ path: normalisePath(name), content: strFromU8(u8) }));
  checkProject(files);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
