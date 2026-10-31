// Profile pictures (owner, 2026-10-31). Without a picture, each person gets their own two-colour gradient instead of
// their initials: worked out from their id, so it's the same on every page and every visit. A picture is a PNG, JPEG
// or WebP, told by its first bytes (never by its name), up to 5 MB.
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function gradientFor(id: string): string {
  const h = hash(id);
  const from = h % 360;
  const to = (from + 40 + ((h >>> 9) % 60)) % 360; // a neighbouring hue, 40–100° on
  return `linear-gradient(135deg, hsl(${from} 70% 55%), hsl(${to} 75% 45%))`;
}

export type PictureType = 'image/png' | 'image/jpeg' | 'image/webp';
export function pictureType(b: Uint8Array): PictureType | null {
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// The picture's address: its key in the URL, so a new picture is fetched at once and an old one can be cached.
export const avatarSrc = (userId: string, image: string) => `/api/avatars/${userId}?v=${image.slice(0, 8)}`;
