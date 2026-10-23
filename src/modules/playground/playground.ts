// The Playground (FR-CODE-07): a student's own projects, outside any class. Each starts from the language's
// template, is autosaved like a draft (FR-CODE-05) and checked against the same project rules. A project is found
// by its owner only; for anyone else it doesn't exist. No audit rows: like drafts, it's the student's scratch work.
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { playgroundProject, user } from '@/db/schema';
import type { ProjectFile } from '@/lib/project/files';
import { sentFiles } from '@/modules/assessments/projects';
import { defaultStarter } from '@/modules/assessments/rules';
import type { Actor } from '@/server/actor';
import { assertCan, isUniqueViolation, ValidationError } from '@/server/errors';

export const PLAYGROUND_LIMIT = 10;
export const PLAYGROUND_LANGUAGES = ['python', 'java', 'web'] as const;
export type PlaygroundLanguage = (typeof PLAYGROUND_LANGUAGES)[number];

const nameSchema = z.string().trim().min(1, 'Give the project a name.').max(60, 'Keep the name under 60 characters.');
const languageSchema = z.enum(PLAYGROUND_LANGUAGES, { error: 'Choose Python, Java or Web.' });
const GONE = 'That project no longer exists.';

function parse<T extends z.ZodType>(schema: T, raw: unknown, field: string): z.output<T> {
  const r = schema.safeParse(raw);
  if (!r.success) throw new ValidationError(r.error.issues[0]?.message ?? 'Check this and try again.', field);
  return r.data;
}
const taken = (name: string) => new ValidationError(`You already have a project called ${name}.`, 'name');

export type PlaygroundSummary = { id: string; name: string; language: PlaygroundLanguage; files: number; savedAt: Date };

export async function myProjects(actor: Actor | null): Promise<PlaygroundSummary[]> {
  assertCan(actor, 'playground.use');
  const rows = await db
    .select({
      id: playgroundProject.id,
      name: playgroundProject.name,
      language: playgroundProject.language,
      files: sql<number>`jsonb_array_length(${playgroundProject.files})::int`,
      savedAt: playgroundProject.updatedAt,
    })
    .from(playgroundProject)
    .where(eq(playgroundProject.ownerId, actor.userId))
    .orderBy(desc(playgroundProject.updatedAt), desc(playgroundProject.createdAt));
  return rows.map((r) => ({ ...r, language: r.language as PlaygroundLanguage }));
}

export async function createProject(actor: Actor | null, raw: { name: unknown; language: unknown }): Promise<string> {
  assertCan(actor, 'playground.use');
  const name = parse(nameSchema, raw.name, 'name');
  const language = parse(languageSchema, raw.language, 'language');
  const id = crypto.randomUUID();
  try {
    await db.transaction(async (tx) => {
      // One at a time per student, so two quick clicks can't both slip under the limit.
      await tx.select({ id: user.id }).from(user).where(eq(user.id, actor.userId)).for('update');
      const [{ n }] = (await tx.select({ n: count() }).from(playgroundProject).where(eq(playgroundProject.ownerId, actor.userId))) as [
        { n: number },
      ];
      if (n >= PLAYGROUND_LIMIT)
        throw new ValidationError(`You can keep up to ${PLAYGROUND_LIMIT} projects. Delete one you don’t need first.`);
      await tx.insert(playgroundProject).values({ id, ownerId: actor.userId, name, language, files: defaultStarter(language) });
    });
  } catch (e) {
    if (isUniqueViolation(e, 'playground_project_name_unique')) throw taken(name);
    throw e;
  }
  return id;
}

async function mine(actor: Actor | null, id: string) {
  assertCan(actor, 'playground.use');
  const [p] = await db
    .select()
    .from(playgroundProject)
    .where(and(eq(playgroundProject.id, id), eq(playgroundProject.ownerId, actor.userId)))
    .limit(1);
  if (!p) throw new ValidationError(GONE);
  return p;
}

export async function openProject(actor: Actor | null, id: string) {
  const p = await mine(actor, id);
  return { id: p.id, name: p.name, language: p.language as PlaygroundLanguage, files: p.files as ProjectFile[], savedAt: p.updatedAt };
}

// Autosave: the files are checked as a project (safe paths, allowed types, the limits) before anything is written.
export async function saveProject(actor: Actor | null, id: string, raw: unknown): Promise<{ savedAt: Date }> {
  const p = await mine(actor, id);
  const files = await sentFiles(raw, async () => p.files as ProjectFile[]);
  // The database's clock, like created_at, so the list's order never depends on two clocks agreeing.
  const [saved] = await db
    .update(playgroundProject)
    .set({ files, updatedAt: sql`now()` })
    .where(and(eq(playgroundProject.id, id), eq(playgroundProject.ownerId, actor!.userId)))
    .returning({ savedAt: playgroundProject.updatedAt });
  if (!saved) throw new ValidationError(GONE); // deleted in another tab
  return saved;
}

export async function renameProject(actor: Actor | null, id: string, raw: unknown) {
  await mine(actor, id);
  const name = parse(nameSchema, raw, 'name');
  try {
    await db
      .update(playgroundProject)
      .set({ name })
      .where(and(eq(playgroundProject.id, id), eq(playgroundProject.ownerId, actor!.userId)));
  } catch (e) {
    if (isUniqueViolation(e, 'playground_project_name_unique')) throw taken(name);
    throw e;
  }
}

export async function deleteProject(actor: Actor | null, id: string): Promise<{ name: string }> {
  const p = await mine(actor, id);
  await db.delete(playgroundProject).where(and(eq(playgroundProject.id, id), eq(playgroundProject.ownerId, actor!.userId)));
  return { name: p.name };
}
