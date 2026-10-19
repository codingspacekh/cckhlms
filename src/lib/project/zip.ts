// Zip import/export in the browser (FR-CODE-03). Checks every path so a zip can't write outside the project.
// fflate, not JSZip: JSZip's bundled Node polyfills call Function() and trip the strict CSP (M0, ADR 0002).
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { checkProject, LIMITS, normalisePath, ProjectError, type ProjectFile } from './files';

const isJunk = (p: string) => p.startsWith('__MACOSX/') || p.split('/').pop() === '.DS_Store';

export function exportProject(files: ProjectFile[]): Uint8Array {
  for (const f of files) if (normalisePath(f.path) !== f.path) throw new ProjectError('unsafe-path', f.path);
  checkProject(files);
  return zipSync(Object.fromEntries(files.map((f) => [f.path, strToU8(f.content)])), { level: 6 });
}

// IDEs zip a project inside its folder (my-game/src/…); take the files out of a single top folder, except src/.
function withoutTopFolder(files: ProjectFile[]): ProjectFile[] {
  const tops = new Set(files.map((f) => (f.path.includes('/') ? f.path.split('/')[0] : '')));
  const [top] = tops;
  if (tops.size !== 1 || !top || top === 'src') return files;
  return files.map((f) => ({ ...f, path: f.path.slice(top.length + 1) }));
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
  const files = withoutTopFolder(Object.entries(entries).map(([name, u8]) => ({ path: normalisePath(name), content: strFromU8(u8) })));
  checkProject(files);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
