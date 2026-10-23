// Autosave sends the whole project about a second after typing stops (FR-CODE-05). Pictures are big and rarely
// change, so one the server already has goes as { path, sameAs } (where it was saved) and the server fills it in
// from the saved copy. Code always goes in full.
import { isImagePath, ProjectError, type ProjectFile } from './files';

export type SentFile = ProjectFile | { path: string; sameAs: string };

export function forSaving(files: ProjectFile[], saved: ProjectFile[]): SentFile[] {
  const savedAt = new Map(saved.filter((f) => isImagePath(f.path)).map((f) => [f.content, f.path]));
  return files.map((f) => {
    const sameAs = isImagePath(f.path) ? savedAt.get(f.content) : undefined;
    return sameAs ? { path: f.path, sameAs } : f;
  });
}

export const isShortened = (sent: SentFile[]) => sent.some((f) => 'sameAs' in f);

// The server's side: a picture named by sameAs must be a picture in the saved copy (another tab may have changed
// it; the browser then sends everything).
export function filledIn(sent: SentFile[], saved: ProjectFile[]): ProjectFile[] {
  return sent.map((f) => {
    if (!('sameAs' in f)) return f;
    const from = saved.find((s) => s.path === f.sameAs && isImagePath(s.path));
    if (!from || !isImagePath(f.path)) throw new ProjectError('bad-image', f.path);
    return { path: f.path, content: from.content };
  });
}
