// Adding files from the computer to a project (FR-CODE-02/03): single files, a whole folder, or a zip's files.
// Pictures bigger than the limit go through `fit` first (in the browser it makes them smaller: shrink.ts).
import { ALLOWED_EXTENSIONS, extensionOf, imageDataUrl, isImagePath, LIMITS, normalisePath, ProjectError, type ProjectFile } from './files';

export type Picked = { path: string; bytes: Uint8Array };
export type FitImage = (path: string, bytes: Uint8Array) => Promise<Uint8Array>;

// Pictures read before any are made smaller, so a folder of hundreds of photos is refused before decoding them.
export const MAX_PICKED_IMAGE_BYTES = 25 * 1024 * 1024;

// Files a computer or a tool adds by itself (macOS, Windows, git, editors), never part of the work.
export function isJunk(path: string): boolean {
  const parts = path.replace(/\\/g, '/').split('/');
  return (
    parts[0] === '__MACOSX' ||
    parts.some((p) => p.startsWith('.') && p !== '.' && p !== '..') ||
    ['Thumbs.db', 'desktop.ini'].includes(parts.at(-1)!)
  );
}

const decoder = new TextDecoder();
export async function toProjectFiles(picked: Picked[], fit?: FitImage): Promise<ProjectFile[]> {
  return Promise.all(
    picked.map(async ({ path, bytes }) => {
      if (!isImagePath(path)) return { path, content: decoder.decode(bytes) };
      const fitted = fit && bytes.length > LIMITS.maxImageBytes ? await fit(path, bytes) : bytes;
      return { path, content: imageDataUrl(path, fitted) };
    }),
  );
}

// Where each picked file goes in the project, or null for one left out: junk silently, a type a project can't hold
// named in `skipped`, so the rest still comes in. A folder's files keep their folders inside it. A project folder
// (index.html, main.py, Main.java or src/ at its top) gives what's inside it; any other folder, like images/, comes
// in as itself.
export function placePicked(paths: string[], folder: boolean): { placed: (string | null)[]; skipped: string[] } {
  const clean = paths.map((p) => (isJunk(p) ? null : normalisePath(p)));
  const kept = clean.filter((p): p is string => p !== null);
  const top = kept[0]?.split('/')[0];
  const inside = (p: string) => p.slice(top!.length + 1);
  const unwrap =
    folder &&
    top !== undefined &&
    kept.every((p) => p.startsWith(`${top}/`)) &&
    kept.some((p) => ['index.html', 'main.py', 'Main.java'].includes(inside(p)) || inside(p).startsWith('src/'));
  const skipped: string[] = [];
  const placed = clean.map((p) => {
    if (p === null) return null;
    if (!ALLOWED_EXTENSIONS.includes(extensionOf(p))) return (skipped.push(p), null);
    return unwrap ? inside(p) : p;
  });
  return { placed, skipped };
}

// Before reading anything: too many files, or far too many bytes of pictures, can't fit whatever happens next.
export function checkPicked(picked: { path: string; size: number }[]): void {
  if (picked.length > LIMITS.maxFiles) throw new ProjectError('too-many-files');
  const images = picked.filter((p) => isImagePath(p.path)).reduce((n, p) => n + p.size, 0);
  if (images > MAX_PICKED_IMAGE_BYTES) throw new ProjectError('images-too-large');
}

// Added files replace ones with the same name (any capitals); the rest of the project stays.
export const mergeFiles = (existing: ProjectFile[], added: ProjectFile[]) => [
  ...existing.filter((f) => !added.some((a) => a.path.toLowerCase() === f.path.toLowerCase())),
  ...added,
];
