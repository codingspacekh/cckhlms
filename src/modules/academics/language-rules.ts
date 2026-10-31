// The languages a course is taught in (M18, BR-32), without the database. Python, Java and HTML/CSS/JS are written in
// the code editor; paper is work done on paper or in class; any language Admin adds (Scratch, Roblox …) is handed
// in as a project file or a link and opened by the teacher outside the LMS.
import { z } from 'zod';

export const BUILT_IN = ['python', 'java', 'web'] as const;
export type CodeLanguage = (typeof BUILT_IN)[number];
export const PAPER = 'paper';
export type HandIn = 'code' | 'paper' | 'upload';

export const isCodeLanguage = (id: string): id is CodeLanguage => (BUILT_IN as readonly string[]).includes(id);

export function handInOf(l: { id: string; byFile: boolean; byLink: boolean }): HandIn {
  if (isCodeLanguage(l.id)) return 'code';
  if (l.id === PAPER) return 'paper';
  return 'upload';
}

// What a hand-in can be at most (M18b): a project file of this size, and this many file types and sites.
export const MAX_PROJECT_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TYPES = 10;
// Files a browser or a computer would run rather than open in Scratch or Roblox Studio.
const NEVER = new Set([
  '.exe',
  '.msi',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.ps1',
  '.sh',
  '.app',
  '.dmg',
  '.pkg',
  '.apk',
  '.jar',
  '.js',
  '.html',
  '.htm',
  '.svg',
]);

const list = (raw: unknown) =>
  String(raw ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
const checked = z.preprocess((v) => v === 'on' || v === true || v === 'true', z.boolean());

const fileTypes = z.preprocess(
  (v) => list(v).map((t) => (t.startsWith('.') ? t : `.${t}`).toLowerCase()),
  z
    .array(z.string())
    .max(MAX_TYPES, `Use at most ${MAX_TYPES} file types.`)
    .superRefine((types, ctx) => {
      for (const t of types) {
        if (!/^\.[a-z0-9]{1,12}$/.test(t)) {
          ctx.addIssue({ code: 'custom', message: `“${t}” isn’t a file type. Use ones like .sb3.` });
          return;
        }
        if (NEVER.has(t)) {
          ctx.addIssue({ code: 'custom', message: `${t} files can’t be handed in.` });
          return;
        }
      }
    }),
);

// A site as people paste it ("https://www.roblox.com/games") is kept as its host name.
const hostOf = (s: string) =>
  s
    .replace(/^https?:\/\//i, '')
    .split(/[/?#]/)[0]!
    .toLowerCase();
const linkSites = z.preprocess(
  (v) => list(v).map((s) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(s) ? hostOf(s) : s)),
  z
    .array(z.string())
    .max(MAX_TYPES, `Use at most ${MAX_TYPES} sites.`)
    .superRefine((sites, ctx) => {
      const bad = sites.find((s) => !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(s));
      if (bad) ctx.addIssue({ code: 'custom', message: `“${bad}” isn’t a website. Use ones like scratch.mit.edu.` });
    }),
);

export const languageInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the language a name.').max(40, 'Keep the name under 40 characters.'),
    byFile: checked.default(false),
    fileTypes: fileTypes.default([]),
    byLink: checked.default(false),
    linkSites: linkSites.default([]),
  })
  .superRefine((l, ctx) => {
    if (!l.byFile && !l.byLink)
      ctx.addIssue({ code: 'custom', path: ['byFile'], message: 'Choose how students hand in work: a project file, a link, or both.' });
    else if (l.byFile && !l.fileTypes.length)
      ctx.addIssue({ code: 'custom', path: ['fileTypes'], message: 'Say which file types students hand in, like .sb3.' });
  })
  // What isn't chosen isn't kept: no file types without files, no sites without links.
  .transform((l) => ({ ...l, fileTypes: l.byFile ? l.fileTypes : [], linkSites: l.byLink ? l.linkSites : [] }));
export type LanguageInput = Partial<Record<keyof z.input<typeof languageInputSchema>, unknown>>;
