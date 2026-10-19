// A student project (FR-CODE-02): text files in folders. The same rules run in the browser (editor, zip
// import) and on the server (saving a draft or a submission), so the limits can't be skipped.
export type ProjectFile = { path: string; content: string };

export const LIMITS = { maxFiles: 30, maxBytes: 200 * 1024, maxPathLength: 200 };
export const ALLOWED_EXTENSIONS = ['py', 'java', 'html', 'htm', 'css', 'js', 'json', 'txt', 'md', 'csv'];

export type ProjectErrorCode = 'unsafe-path' | 'bad-name' | 'bad-type' | 'duplicate' | 'empty' | 'too-many-files' | 'too-large' | 'bad-zip';
const MESSAGES: Record<ProjectErrorCode, string> = {
  'unsafe-path': 'A file is outside the project folder (for example "../"). Remove it and try again.',
  'bad-name': 'File and folder names can use letters, numbers, spaces, dots, - and _, and can’t start with a dot.',
  'bad-type': `Only code and text files can be added (${ALLOWED_EXTENSIONS.join(', ')}).`,
  duplicate: 'Two files have the same name.',
  empty: 'A project needs at least one file.',
  'too-many-files': `A project can have at most ${LIMITS.maxFiles} files.`,
  'too-large': `A project can have at most ${LIMITS.maxBytes / 1024} KB of code.`,
  'bad-zip': 'That file is not a zip we can open.',
};

export class ProjectError extends Error {
  constructor(
    public readonly code: ProjectErrorCode,
    detail?: string,
  ) {
    super(detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code]);
    this.name = 'ProjectError';
  }
}

export function normalisePath(raw: string): string {
  const p = raw.replace(/\\/g, '/');
  if (p.startsWith('/') || /^[a-zA-Z]:\//.test(p)) throw new ProjectError('unsafe-path', raw);
  const parts = p.split('/').filter((s) => s !== '' && s !== '.');
  if (parts.some((s) => s === '..') || parts.length === 0) throw new ProjectError('unsafe-path', raw);
  return parts.join('/');
}

const SEGMENT = /^[A-Za-z0-9 _-][A-Za-z0-9 ._-]*$/;
export function isValidPath(path: string): boolean {
  if (path.length > LIMITS.maxPathLength) return false;
  const parts = path.split('/');
  return parts.every((s) => SEGMENT.test(s) && s.trim() === s);
}

const extensionOf = (path: string) => (path.includes('.') ? (path.split('.').pop() ?? '').toLowerCase() : '');
export const bytesOf = (files: ProjectFile[]) => files.reduce((n, f) => n + new TextEncoder().encode(f.content).length, 0);

export function checkProject(files: ProjectFile[]): void {
  if (files.length === 0) throw new ProjectError('empty');
  if (files.length > LIMITS.maxFiles) throw new ProjectError('too-many-files');
  const seen = new Set<string>();
  for (const f of files) {
    if (!ALLOWED_EXTENSIONS.includes(extensionOf(f.path))) throw new ProjectError('bad-type', f.path);
    if (!isValidPath(f.path)) throw new ProjectError('bad-name', f.path);
    const key = f.path.toLowerCase(); // Windows and macOS can't hold Main.java and main.java side by side
    if (seen.has(key)) throw new ProjectError('duplicate', f.path);
    seen.add(key);
  }
  if (bytesOf(files) > LIMITS.maxBytes) throw new ProjectError('too-large');
}

export type CodeLanguage = 'python' | 'java' | 'html' | 'css' | 'javascript';
export function languageOf(path: string): CodeLanguage | null {
  const ext = extensionOf(path);
  if (ext === 'py') return 'python';
  if (ext === 'java') return 'java';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'css') return 'css';
  if (ext === 'js' || ext === 'json') return 'javascript';
  return null;
}

// A name typed for a new file or a rename, tidied, or what's wrong with it (FR-CODE-02).
export function checkNewPath(existing: string[], raw: string, renaming?: string): { path: string } | { error: string } {
  const typed = raw.trim();
  if (!typed) return { error: 'Type a file name, for example game.py or src/game/Player.java.' };
  let path: string;
  try {
    path = normalisePath(typed);
  } catch (e) {
    return { error: (e as ProjectError).message };
  }
  const ext = extensionOf(path);
  if (!ext) return { error: 'Add an extension, for example .py, .java, .html, .css or .js.' };
  if (!ALLOWED_EXTENSIONS.includes(ext)) return { error: MESSAGES['bad-type'] };
  if (!isValidPath(path)) return { error: MESSAGES['bad-name'] };
  if (existing.some((p) => p !== renaming && p.toLowerCase() === path.toLowerCase()))
    return { error: `There is already a file called ${path}.` };
  if (!renaming && existing.length >= LIMITS.maxFiles) return { error: MESSAGES['too-many-files'] };
  return { path };
}
