// Profile pictures (owner, 2026-10-31): without one, each person gets their own gradient, not their initials; a picture
// is a PNG, JPEG or WebP, told by its first bytes, never by its name.
import { describe, expect, it } from 'vitest';
import { gradientFor, MAX_AVATAR_BYTES, pictureType } from '@/lib/avatar';

describe('the default picture', () => {
  it('is a gradient of two colours, the same for a person every time, and different between people', () => {
    const a = gradientFor('0b0f3c64-4c1e-4f0e-9a1a-3e2f5d6c7b8a');
    expect(a).toMatch(/^linear-gradient\(135deg, hsl\(\d+ \d+% \d+%\), hsl\(\d+ \d+% \d+%\)\)$/);
    expect(gradientFor('0b0f3c64-4c1e-4f0e-9a1a-3e2f5d6c7b8a')).toBe(a);
    const many = new Set(Array.from({ length: 50 }, (_, i) => gradientFor(`user-${i}`)));
    expect(many.size).toBeGreaterThan(40);
  });
});

describe('a picture', () => {
  it('is up to 5 MB', () => expect(MAX_AVATAR_BYTES).toBe(5 * 1024 * 1024));
  it('is PNG, JPEG or WebP by its bytes; anything else (SVG, text, a GIF) is not', () => {
    expect(pictureType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(pictureType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image/jpeg');
    expect(pictureType(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
    expect(pictureType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(pictureType(new TextEncoder().encode('GIF89a'))).toBeNull();
    expect(pictureType(new Uint8Array())).toBeNull();
  });
});
