// BR-06 · FR-ADM-12: each certificate has a unique, non-guessable verification code (≥ 128 bits, URL-safe), and
// its QR code opens the verify page. Codes are easy to read aloud and type back: no 0/O or 1/I/L mix-ups.
import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, formatCode, newCode, normaliseCode, verifyUrl } from '@/modules/certificates/rules';

describe('verification codes', () => {
  it('carry at least 128 random bits in URL-safe characters', () => {
    const code = newCode();
    expect(code.length * Math.log2(CODE_ALPHABET.length)).toBeGreaterThanOrEqual(128);
    expect(code).toMatch(/^[0-9A-Z]+$/);
    expect(encodeURIComponent(code)).toBe(code);
  });

  it('use a 32-letter alphabet without look-alikes, so each byte maps evenly (no bias)', () => {
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(new Set(CODE_ALPHABET).size).toBe(32);
    for (const c of 'ILOU') expect(CODE_ALPHABET).not.toContain(c);
  });

  it('are different every time', () => {
    const codes = new Set(Array.from({ length: 2000 }, newCode));
    expect(codes.size).toBe(2000);
  });

  it('use every letter of the alphabet, roughly evenly', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) for (const c of newCode()) counts.set(c, (counts.get(c) ?? 0) + 1);
    expect(counts.size).toBe(32);
    const expected = (2000 * newCode().length) / 32;
    for (const n of counts.values()) expect(Math.abs(n - expected) / expected).toBeLessThan(0.15);
  });

  it('show in groups of four, and read back however they are typed', () => {
    const code = 'ABCD2345EFGH6789JKMNPQRSTV';
    expect(formatCode(code)).toBe('ABCD-2345-EFGH-6789-JKMN-PQRS-TV');
    expect(normaliseCode('abcd-2345 efgh-6789-jkmn-pqrs-tv')).toBe(code);
    // What people mistype: O for 0, I or L for 1.
    expect(normaliseCode('aOcd-2345-efgh-6789-jkmn-pqrs-lI')).toBe('A0CD2345EFGH6789JKMNPQRS11');
  });

  it('refuse anything that cannot be a code', () => {
    expect(normaliseCode('')).toBeNull();
    expect(normaliseCode('ABC')).toBeNull();
    expect(normaliseCode('A'.repeat(26) + '!')).toBeNull();
    expect(normaliseCode('<script>')).toBeNull();
  });
});

describe('the QR code', () => {
  it('opens the verify page for the code', () => {
    const url = verifyUrl('https://lms.cckh.dev', 'ABCD2345EFGH6789JKMNPQRSTV');
    expect(url).toBe('https://lms.cckh.dev/verify/ABCD2345EFGH6789JKMNPQRSTV');
    const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
    expect(qr.segments.map((s) => (typeof s.data === 'string' ? s.data : new TextDecoder().decode(s.data))).join('')).toBe(url);
  });
});
