// In the browser: the middle square of a photo, 256 px, as WebP (or JPEG where the browser can't save WebP), so a
// 5 MB photo becomes a few kilobytes before it's sent.
const SIDE = 256;

export async function squarePicture(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = SIDE;
    canvas.height = SIDE;
    canvas.getContext('2d')?.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
    for (const type of ['image/webp', 'image/jpeg']) {
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.88));
      if (blob && blob.type === type) return blob;
    }
    throw new Error('This browser can’t save the picture.');
  } finally {
    bitmap.close();
  }
}
