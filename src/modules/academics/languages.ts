// The languages a course is taught in (M18, BR-32): the built-in ones and those Admin adds, such as Scratch and Roblox.
// A language in use (by a course or a piece of work) can't be deleted; the database refuses it too.
import { asc, count, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { assessment, course, language } from '@/db/schema';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { handInOf, languageInputSchema, PAPER, type HandIn, type LanguageInput } from './language-rules';

type Row = typeof language.$inferSelect;
export type LanguageChoice = { id: string; name: string; handIn: HandIn };
export type LanguageInfo = LanguageChoice & {
  builtIn: boolean;
  byFile: boolean;
  fileTypes: string[];
  byLink: boolean;
  linkSites: string[];
};
export type LanguageSummary = LanguageInfo & { courses: number };

const info = (r: Row): LanguageInfo => ({
  id: r.id,
  name: r.name,
  handIn: handInOf(r),
  builtIn: r.builtIn,
  byFile: r.byFile,
  fileTypes: r.fileTypes,
  byLink: r.byLink,
  linkSites: r.linkSites,
});
const ordered = () =>
  db
    .select()
    .from(language)
    .orderBy(asc(language.position), asc(sql`lower(${language.name})`));

// Every language with its rules, in order (built-in first, then by name). For forms and pages: no actor needed.
export async function allLanguages(): Promise<LanguageInfo[]> {
  return (await ordered()).map(info);
}

// The choices a course or a piece of work can take.
export async function languageChoices(): Promise<LanguageChoice[]> {
  return (await allLanguages()).map(({ id, name, handIn }) => ({ id, name, handIn }));
}

// Each language's name, by id, for pages that show the language of a course or a piece of work.
export async function languageNames(): Promise<Map<string, string>> {
  return new Map((await db.select({ id: language.id, name: language.name }).from(language)).map((r) => [r.id, r.name]));
}

// The languages work in a course can be set in (M18): a course in a built-in language can have work in any built-in
// language or on paper; a course in an added language (Scratch …) has work in that language or on paper.
export async function workLanguagesFor(courseLanguage: string): Promise<LanguageChoice[]> {
  const all = await languageChoices();
  const added = all.find((l) => l.id === courseLanguage && l.handIn === 'upload');
  return all.filter((l) => (added ? l.id === added.id || l.handIn === 'paper' : l.handIn !== 'upload'));
}

export async function getLanguage(id: string): Promise<LanguageInfo | null> {
  const [r] = await db.select().from(language).where(eq(language.id, id)).limit(1);
  return r ? info(r) : null;
}

// Courses → Languages: the ones a course can be taught in (paper is only for work), and how many courses use each.
export async function listLanguages(actor: Actor | null): Promise<LanguageSummary[]> {
  assertCan(actor, 'courses.manage');
  const [rows, used] = await Promise.all([
    ordered(),
    db.select({ id: course.defaultLanguage, n: count() }).from(course).groupBy(course.defaultLanguage),
  ]);
  const n = new Map(used.map((u) => [u.id, u.n]));
  return rows.filter((r) => r.id !== PAPER).map((r) => ({ ...info(r), courses: n.get(r.id) ?? 0 }));
}

function parse(raw: LanguageInput) {
  const parsed = languageInputSchema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  return parsed.data;
}

async function checkName(name: string, id: string | null) {
  const [clash] = await db
    .select({ id: language.id, name: language.name })
    .from(language)
    .where(sql`lower(${language.name}) = lower(${name})`)
    .limit(1);
  if (clash && clash.id !== id) throw new ValidationError(`There is already a language called ${clash.name}.`, 'name');
}

async function editable(id: string, what: 'changed' | 'deleted') {
  const l = await getLanguage(id);
  if (!l) throw new ValidationError('That language no longer exists.');
  if (l.builtIn) throw new ValidationError(`${l.name} comes with the LMS and can’t be ${what}.`);
  return l;
}

export async function createLanguage(actor: Actor | null, raw: LanguageInput): Promise<{ id: string }> {
  assertCan(actor, 'courses.manage');
  const l = parse(raw);
  await checkName(l.name, null);
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(language).values({ id, ...l });
    await audit({ actorId: actor.userId, action: 'language.create', entity: 'language', entityId: id, detail: { name: l.name } }, tx);
  });
  return { id };
}

export async function updateLanguage(actor: Actor | null, id: string, raw: LanguageInput): Promise<void> {
  assertCan(actor, 'courses.manage');
  await editable(id, 'changed');
  const l = parse(raw);
  await checkName(l.name, id);
  await db.transaction(async (tx) => {
    await tx.update(language).set(l).where(eq(language.id, id));
    await audit({ actorId: actor.userId, action: 'language.update', entity: 'language', entityId: id, detail: { name: l.name } }, tx);
  });
}

export async function deleteLanguage(actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, 'courses.manage');
  const l = await editable(id, 'deleted');
  const [[c], [w]] = await Promise.all([
    db.select({ n: count() }).from(course).where(eq(course.defaultLanguage, id)),
    db.select({ n: count() }).from(assessment).where(eq(assessment.language, id)),
  ]);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (c!.n) throw new ValidationError(`${l.name} is used by ${plural(c!.n, 'course', 'courses')}, so it can’t be deleted.`);
  if (w!.n) throw new ValidationError(`${l.name} is used by ${plural(w!.n, 'piece of work', 'pieces of work')}, so it can’t be deleted.`);
  await db.transaction(async (tx) => {
    await tx.delete(language).where(eq(language.id, id));
    await audit({ actorId: actor.userId, action: 'language.delete', entity: 'language', entityId: id, detail: { name: l.name } }, tx);
  });
}
