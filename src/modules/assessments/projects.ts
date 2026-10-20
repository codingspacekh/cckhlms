// Code projects for work set in Python, Java or Web: the teacher's starter files (FR-CODE-06) and each
// student's own draft (FR-CODE-05), which starts as a copy of them. The project rules in src/lib/project run
// here too, so the browser's checks can't be skipped.
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { assessment, workDraft } from '@/db/schema';
import { checkProject, LIMITS, normalisePath, ProjectError, type ProjectFile } from '@/lib/project/files';
import { classAccess } from '@/modules/academics/access';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { defaultStarter, type WorkLanguage } from './rules';
import { readAssessment, type AssessmentView } from './service';

const filesSchema = z
  .array(z.object({ path: z.string().max(LIMITS.maxPathLength), content: z.string() }))
  .max(LIMITS.maxFiles, `A project can have at most ${LIMITS.maxFiles} files.`);

// The files as sent by the browser, checked as a project: safe paths, allowed types, the limits.
export function validFiles(raw: unknown): ProjectFile[] {
  const parsed = filesSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Those files can’t be saved.', 'files');
  try {
    const files = parsed.data.map((f) => ({ path: normalisePath(f.path), content: f.content }));
    if (files.some((f, i) => f.path !== parsed.data[i]!.path)) throw new ProjectError('unsafe-path');
    checkProject(files);
    return files;
  } catch (e) {
    if (e instanceof ProjectError) throw new ValidationError(e.message, 'files');
    throw e;
  }
}

export async function codeWork(assessmentId: string) {
  const [a] = await db.select().from(assessment).where(eq(assessment.id, assessmentId)).limit(1);
  if (!a) throw new ValidationError('That work no longer exists.');
  if (a.language === 'paper') throw new ValidationError('This work is done on paper, so it has no files.');
  return a;
}

export const starterOf = (a: { starterFiles: ProjectFile[]; language: string }) =>
  a.starterFiles.length ? a.starterFiles : defaultStarter(a.language as WorkLanguage);

export async function teacherProject(actor: Actor | null, assessmentId: string): Promise<{ view: AssessmentView; files: ProjectFile[] }> {
  const a = await codeWork(assessmentId);
  assertCan(actor, 'assessment.write', await classAccess(a.classId));
  return { view: await readAssessment(actor, assessmentId), files: starterOf(a) };
}

export async function saveStarterFiles(actor: Actor | null, assessmentId: string, raw: unknown) {
  const [a] = await db.select().from(assessment).where(eq(assessment.id, assessmentId)).limit(1);
  if (!a) throw new ValidationError('That work no longer exists.');
  assertCan(actor, 'assessment.write', await classAccess(a.classId));
  if (a.language === 'paper') throw new ValidationError('This work is done on paper, so it has no files.');
  const files = validFiles(raw);
  await db.update(assessment).set({ starterFiles: files, updatedAt: new Date() }).where(eq(assessment.id, assessmentId));
  await audit({
    actorId: actor.userId,
    action: 'assessment.starter',
    entity: 'assessment',
    entityId: assessmentId,
    detail: { files: files.length },
  });
}

// A student's project: their saved draft, or a fresh copy of the starter files (not saved until they edit).
export async function studentProject(
  actor: Actor | null,
  assessmentId: string,
): Promise<{ view: AssessmentView; files: ProjectFile[]; savedAt: Date | null }> {
  const a = await codeWork(assessmentId);
  assertCan(actor, 'work.save', await classAccess(a.classId));
  if (a.status !== 'published') throw new ValidationError('That work no longer exists.');
  const [d] = await db
    .select()
    .from(workDraft)
    .where(and(eq(workDraft.assessmentId, assessmentId), eq(workDraft.studentId, actor.userId)))
    .limit(1);
  return { view: await readAssessment(actor, assessmentId), files: d?.files ?? starterOf(a), savedAt: d?.updatedAt ?? null };
}

// Autosave (FR-CODE-05): no audit row per keystroke batch; submitting is what's recorded.
export async function saveDraft(actor: Actor | null, assessmentId: string, raw: unknown): Promise<{ savedAt: Date }> {
  const a = await codeWork(assessmentId);
  assertCan(actor, 'work.save', await classAccess(a.classId));
  if (a.status !== 'published') throw new ValidationError('That work no longer exists.');
  const files = validFiles(raw);
  const savedAt = new Date();
  await db
    .insert(workDraft)
    .values({ id: crypto.randomUUID(), assessmentId, studentId: actor.userId, files, updatedAt: savedAt })
    .onConflictDoUpdate({ target: [workDraft.assessmentId, workDraft.studentId], set: { files, updatedAt: savedAt } });
  return { savedAt };
}
