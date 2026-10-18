// FR-AUTH-03/07, FR-ADM-01/02/16: generated passwords and usernames, input rules, time zones.
import { describe, expect, it } from 'vitest';
import { accountInputSchema, generatePassword, isValidTimeZone, suggestUsername, usernameSchema } from '@/modules/identity/rules';

describe('generatePassword', () => {
  it('makes a readable password that is long enough (word-word-NN)', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
      expect(p.length).toBeGreaterThanOrEqual(10);
    }
  });
  it('rarely repeats', () => {
    expect(new Set(Array.from({ length: 300 }, generatePassword)).size).toBeGreaterThan(290);
  });
});

describe('suggestUsername', () => {
  it('uses the first name and the initial of the last name', () => {
    expect(suggestUsername('Bopha Lim', new Set())).toBe('bopha.l');
    expect(suggestUsername('Sok Dara Kim', new Set())).toBe('sok.k');
  });
  it('adds a number when the name is taken', () => {
    expect(suggestUsername('Bopha Lim', new Set(['bopha.l']))).toBe('bopha.l2');
    expect(suggestUsername('Bopha Lim', new Set(['bopha.l', 'bopha.l2']))).toBe('bopha.l3');
  });
  it('turns accents into plain letters', () => {
    expect(suggestUsername('José Ruíz', new Set())).toBe('jose.r');
  });
  it('falls back to "user" for names without Latin letters', () => {
    expect(suggestUsername('សុខា', new Set())).toBe('user1');
    expect(suggestUsername('សុខា', new Set(['user1']))).toBe('user2');
  });
  it('always produces a valid username', () => {
    for (const n of ['A', 'Mary-Jane O’Neil', '  lots   of   space  ', 'x'.repeat(60)]) {
      expect(usernameSchema.safeParse(suggestUsername(n, new Set())).success, n).toBe(true);
    }
  });
});

describe('usernameSchema', () => {
  it.each(['bopha.l', 'theara_n', 'abc', 'user12'])('accepts %s', (u) => expect(usernameSchema.safeParse(u).success).toBe(true));
  it.each(['ab', 'Bopha', 'has space', 'x'.repeat(31), '../x', 'bopha-l', '.bopha'])('rejects %s', (u) =>
    expect(usernameSchema.safeParse(u).success).toBe(false),
  );
});

describe('accountInputSchema', () => {
  it('needs a name and a known role', () => {
    expect(accountInputSchema.safeParse({ role: 'student', name: 'Bopha Lim' }).success).toBe(true);
    expect(accountInputSchema.safeParse({ role: 'student', name: '  ' }).success).toBe(false);
    expect(accountInputSchema.safeParse({ role: 'owner', name: 'X' }).success).toBe(false);
  });
  it('treats an empty username as "suggest one"', () => {
    expect(accountInputSchema.parse({ role: 'teacher', name: 'Dara Kim', username: '' }).username).toBeUndefined();
  });
  it('limits the guardian phone and notes', () => {
    expect(accountInputSchema.safeParse({ role: 'student', name: 'X', guardianPhone: '0'.repeat(31) }).success).toBe(false);
    expect(accountInputSchema.safeParse({ role: 'student', name: 'X', notes: 'n'.repeat(1001) }).success).toBe(false);
  });
});

describe('isValidTimeZone', () => {
  it('knows real IANA time zones', () => {
    expect(isValidTimeZone('Asia/Phnom_Penh')).toBe(true);
    expect(isValidTimeZone('Asia/Bangkok')).toBe(true);
  });
  it('rejects made-up ones', () => {
    expect(isValidTimeZone('Mars/Base_One')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
