// Certificate verification codes (BR-06, FR-ADM-12). Crockford's base32 alphabet: no I, L, O or U, so a code read
// aloud or typed from paper can't be mixed up, and 256 is a multiple of 32, so every letter is equally likely.
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 26; // 26 × 5 = 130 random bits

export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % 32]).join('');
}

// For people: ABCD-2345-EFGH-…
export const formatCode = (code: string) => code.match(/.{1,4}/g)!.join('-');

// The code as it arrives in /verify/<code>. A broken escape (%E0%A4) reads as no code, not a server error.
export function codeFromPath(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return '';
  }
}

// Whatever was typed or scanned → the stored code, or null if it can't be one.
export function normaliseCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (code.length !== LENGTH) return null;
  for (const c of code) if (!CODE_ALPHABET.includes(c)) return null;
  return code;
}

export const verifyUrl = (origin: string, code: string) => `${origin.replace(/\/$/, '')}/verify/${code}`;
