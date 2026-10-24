// Makes a photo small enough for a project (LIMITS.maxImageBytes, or maxBytes: a lesson note allows 2 MB), in the
// browser: scaled to fit 1600 px, then
// smaller again until it fits, saved in its own format so its name (and the page's <img src>) stays the same.
// GIFs (they may move) and SVGs (drawings) are left as they are; the project check then explains the limit.
import { imageTypeOf, LIMITS } from './files';
import type { FitImage } from './upload';

const MAX_SIDE = 1600;
const SHRINKABLE = ['image/png', 'image/jpeg', 'image/webp'];

export const fitImage: FitImage = async (path, bytes, maxBytes = LIMITS.maxImageBytes) => {
  const type = imageTypeOf(path);
  if (!type || !SHRINKABLE.includes(type)) return bytes;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type }));
  } catch {
    return bytes; // not a picture the browser can open: the project check says so
  }
  try {
    let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 8; attempt++, scale *= 0.75) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.85));
      if (!blob || blob.type !== type) return bytes; // this browser can't save that format
      if (blob.size <= maxBytes) return new Uint8Array(await blob.arrayBuffer());
    }
    return bytes;
  } finally {
    bitmap.close();
  }
};
