// M18a · BR-32: the languages Admin adds, such as Scratch and Roblox, and how their work is handed in.
import { describe, expect, it } from 'vitest';
import { BUILT_IN, handInOf, isCodeLanguage, languageInputSchema, PAPER } from '@/modules/academics/language-rules';

const parse = (raw: Record<string, unknown>) => languageInputSchema.safeParse(raw);
const ok = (raw: Record<string, unknown>) => {
  const r = parse(raw);
  if (!r.success) throw new Error(r.error.issues[0]!.message);
  return r.data;
};
const error = (raw: Record<string, unknown>) => {
  const r = parse(raw);
  return r.success ? null : r.error.issues[0]!.message;
};

describe('a language Admin adds', () => {
  it('takes a name, its file types and its link sites, written as people type them', () => {
    expect(
      ok({
        name: '  Roblox ',
        byFile: 'on',
        fileTypes: 'RBXL, .rbxlx',
        byLink: 'on',
        linkSites: 'https://www.roblox.com/games, create.roblox.com',
      }),
    ).toEqual({
      name: 'Roblox',
      byFile: true,
      fileTypes: ['.rbxl', '.rbxlx'],
      byLink: true,
      linkSites: ['www.roblox.com', 'create.roblox.com'],
    });
    expect(ok({ name: 'Scratch', byLink: 'on', linkSites: '' })).toEqual({
      name: 'Scratch',
      byFile: false,
      fileTypes: [],
      byLink: true,
      linkSites: [],
    });
  });

  it('needs a name, at least one way to hand in, and file types for a file', () => {
    expect(error({ name: ' ', byLink: 'on' })).toBe('Give the language a name.');
    expect(error({ name: 'x'.repeat(41), byLink: 'on' })).toBe('Keep the name under 40 characters.');
    expect(error({ name: 'Scratch' })).toBe('Choose how students hand in work: a project file, a link, or both.');
    expect(error({ name: 'Scratch', byFile: 'on', fileTypes: ' ' })).toBe('Say which file types students hand in, like .sb3.');
  });

  it('refuses file types and sites that aren’t plain ones', () => {
    expect(error({ name: 'Scratch', byFile: 'on', fileTypes: '.sb3, ../x' })).toBe('“../x” isn’t a file type. Use ones like .sb3.');
    expect(error({ name: 'Scratch', byFile: 'on', fileTypes: '.exe' })).toBe('.exe files can’t be handed in.');
    expect(error({ name: 'Scratch', byLink: 'on', linkSites: 'not a site' })).toBe(
      '“not a site” isn’t a website. Use ones like scratch.mit.edu.',
    );
    expect(error({ name: 'Scratch', byFile: 'on', fileTypes: Array.from({ length: 11 }, (_, i) => `.a${i}`).join(',') })).toBe(
      'Use at most 10 file types.',
    );
  });
});

describe('the built-in languages', () => {
  it('are Python, Java and HTML/CSS/JS in the code editor, and paper', () => {
    expect(BUILT_IN).toEqual(['python', 'java', 'web']);
    expect(PAPER).toBe('paper');
    expect(['python', 'java', 'web'].every(isCodeLanguage)).toBe(true);
    expect(isCodeLanguage('paper')).toBe(false);
    expect(isCodeLanguage('a1b2c3')).toBe(false); // an added language never gets the code editor or Run
  });

  it('says how work in each language is handed in', () => {
    expect(handInOf({ id: 'python', byFile: false, byLink: false })).toBe('code');
    expect(handInOf({ id: 'paper', byFile: false, byLink: false })).toBe('paper');
    expect(handInOf({ id: 'x', byFile: true, byLink: true })).toBe('upload');
  });
});
