// A student project (FR-CODE-02): text files in folders, and pictures for Web pages. The same rules run in the
// browser (editor, uploads, zip import) and on the server (saving a draft or a submission), so the limits can't
// be skipped. A picture is kept as a data: URL in `content`, so it travels with the code like any other file.
export type ProjectFile = { path: string; content: string };

export const LIMITS = {
  maxFiles: 30,
  maxBytes: 200 * 1024, // code and text
  maxPathLength: 200,
  maxImageBytes: 300 * 1024, // one picture (bigger photos are made smaller in the browser first)
  maxImagesBytes: 1024 * 1024, // all the pictures together
};
export const TEXT_EXTENSIONS = ['py', 'java', 'html', 'htm', 'css', 'js', 'json', 'txt', 'md', 'csv'];
export const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};
export const ALLOWED_EXTENSIONS = [...TEXT_EXTENSIONS, ...Object.keys(IMAGE_TYPES)];

export type ProjectErrorCode =
  | 'unsafe-path'
  | 'bad-name'
  | 'bad-type'
  | 'duplicate'
  | 'empty'
  | 'too-many-files'
  | 'too-large'
  | 'bad-image'
  | 'image-too-large'
  | 'images-too-large'
  | 'bad-zip';
const MESSAGES: Record<ProjectErrorCode, string> = {
  'unsafe-path': 'A file is outside the project folder (for example "../"). Remove it and try again.',
  'bad-name': 'File and folder names can use letters, numbers, spaces, dots, - and _, and can’t start with a dot.',
  'bad-type': `Only code, text and picture files can be added (${ALLOWED_EXTENSIONS.join(', ')}).`,
  duplicate: 'Two files have the same name.',
  empty: 'A project needs at least one file.',
  'too-many-files': `A project can have at most ${LIMITS.maxFiles} files.`,
  'too-large': `A project can have at most ${LIMITS.maxBytes / 1024} KB of code.`,
  'bad-image': 'A picture is damaged, or isn’t the type its name says.',
  'image-too-large': `A picture can be at most ${LIMITS.maxImageBytes / 1024} KB. Make it smaller and try again.`,
  'images-too-large': `A project can have at most ${LIMITS.maxImagesBytes / 1024 / 1024} MB of pictures.`,
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

export const extensionOf = (path: string) => (path.includes('.') ? (path.split('.').pop() ?? '').toLowerCase() : '');
/** A picture's type (image/png, …) from its name, or undefined for code and text. */
export const imageTypeOf = (path: string) => (Object.hasOwn(IMAGE_TYPES, extensionOf(path)) ? IMAGE_TYPES[extensionOf(path)] : undefined);
export const isImagePath = (path: string) => imageTypeOf(path) !== undefined;
/** Bytes of code and text (pictures have their own limit). */
export const bytesOf = (files: ProjectFile[]) =>
  files.reduce((n, f) => n + (isImagePath(f.path) ? 0 : new TextEncoder().encode(f.content).length), 0);

// Pictures as data: URLs. btoa/atob work on "binary strings", built in chunks so a big picture can't overflow
// the call stack.
const DATA_URL = /^data:([a-z+/.-]+);base64,([A-Za-z0-9+/]*={0,2})$/;
export function imageDataUrl(path: string, bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${imageTypeOf(path) ?? 'application/octet-stream'};base64,${btoa(binary)}`;
}
/** The picture's type and size from its data: URL, or null if it isn't one. */
export function imageInfo(content: string): { type: string; bytes: number } | null {
  const m = DATA_URL.exec(content);
  if (!m) return null;
  const b64 = m[2]!;
  if (b64.length % 4 !== 0) return null;
  return { type: m[1]!, bytes: (b64.length / 4) * 3 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0) };
}
export function imageBytes(content: string): Uint8Array {
  const m = DATA_URL.exec(content);
  if (!m) throw new ProjectError('bad-image');
  const binary = atob(m[2]!);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function checkProject(files: ProjectFile[]): void {
  if (files.length === 0) throw new ProjectError('empty');
  if (files.length > LIMITS.maxFiles) throw new ProjectError('too-many-files');
  const seen = new Set<string>();
  let imagesBytes = 0;
  for (const f of files) {
    const ext = extensionOf(f.path);
    if (!ALLOWED_EXTENSIONS.includes(ext)) throw new ProjectError('bad-type', f.path);
    if (!isValidPath(f.path)) throw new ProjectError('bad-name', f.path);
    const key = f.path.toLowerCase(); // Windows and macOS can't hold Main.java and main.java side by side
    if (seen.has(key)) throw new ProjectError('duplicate', f.path);
    seen.add(key);
    const type = imageTypeOf(f.path);
    if (type) {
      const info = imageInfo(f.content);
      if (!info || info.type !== type) throw new ProjectError('bad-image', f.path);
      if (info.bytes > LIMITS.maxImageBytes) throw new ProjectError('image-too-large', f.path);
      imagesBytes += info.bytes;
    }
  }
  if (bytesOf(files) > LIMITS.maxBytes) throw new ProjectError('too-large');
  if (imagesBytes > LIMITS.maxImagesBytes) throw new ProjectError('images-too-large');
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
  // A picture's bytes can't be typed, and renaming can't turn one kind of file into another.
  const was = renaming ? imageTypeOf(renaming) : undefined;
  if (was && imageTypeOf(path) !== was)
    return { error: `Keep the .${extensionOf(renaming!)} ending: renaming can’t change a picture’s type.` };
  if (!was && isImagePath(path)) return { error: 'A picture can’t be typed in. Use “Upload files” to add one.' };
  if (!isValidPath(path)) return { error: MESSAGES['bad-name'] };
  if (existing.some((p) => p !== renaming && p.toLowerCase() === path.toLowerCase()))
    return { error: `There is already a file called ${path}.` };
  if (!renaming && existing.length >= LIMITS.maxFiles) return { error: MESSAGES['too-many-files'] };
  return { path };
}
