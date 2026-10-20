// Reads the QR code on a certificate PDF, as a phone camera would: finds the QR image in the file, unpacks its
// pixels and decodes them. The PDF stores it as an RGB image compressed with Flate (no predictor), plus a mask.
import { unzlibSync } from 'fflate';
import jsQR from 'jsqr';

export function readQrCode(pdf: Uint8Array): string | null {
  const text = Buffer.from(pdf).toString('latin1');
  for (const m of text.matchAll(/<<([^]*?)>>\s*stream\r?\n/g)) {
    const dict = m[1]!;
    if (!/\/Subtype\s*\/Image/.test(dict) || !/\/ColorSpace\s*\/DeviceRGB/.test(dict) || /\/DecodeParms/.test(dict)) continue;
    const num = (key: string) => Number(new RegExp(`/${key}\\s+(\\d+)`).exec(dict)?.[1]);
    const [width, height, length] = [num('Width'), num('Height'), num('Length')];
    const start = m.index! + m[0].length;
    const rgb = unzlibSync(pdf.subarray(start, start + length));
    if (rgb.length !== width * height * 3) continue;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
      rgba[j] = rgb[i]!;
      rgba[j + 1] = rgb[i + 1]!;
      rgba[j + 2] = rgb[i + 2]!;
      rgba[j + 3] = 255;
    }
    // The image has no quiet zone of its own (margin 0); jsQR copes without one.
    const found = jsQR(rgba, width, height);
    if (found) return found.data;
  }
  return null;
}
