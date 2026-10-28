// FileStorage (architecture §4): lesson attachments on the server's uploads volume, which the nightly backup
// copies to R2. Files are stored under random ids, never under the names people upload.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface FileStorage {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class LocalDiskStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private file(key: string) {
    if (!KEY.test(key)) throw new Error('Invalid storage key');
    return path.join(this.root, key.slice(0, 2), key);
  }

  async put(key: string, data: Uint8Array) {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.part`;
    await writeFile(tmp, data);
    await rename(tmp, file); // a half-written file is never served
  }

  async get(key: string) {
    try {
      return await readFile(this.file(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async remove(key: string) {
    await rm(this.file(key), { force: true });
  }
}

// turbopackIgnore: otherwise Next copies the local uploads/ folder into the build (scripts/check-standalone.mjs).
export const storage: FileStorage = new LocalDiskStorage(
  process.env.UPLOADS_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), 'uploads'),
);
