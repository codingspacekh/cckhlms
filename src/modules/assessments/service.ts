// Classwork, homework and exams set in a week of a class (FR-TCH-07/08), and what students see of them
// (FR-STU-05, BR-01). When work is due is worked out from the class's sessions when read (rules.ts, BR-16).
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { assessment, classSession, klass } from '@/db/schema';
import { classAccess } from '@/modules/academics/access';
import { zonedToUtc } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import { weeksOf } from '@/modules/teaching/weeks';
import { renderMarkdown } from '@/lib/markdown';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import {
  DUE_MODES,
  dueChoices,
  KINDS,
  nextHeldSession,
  resolveDue,
  WORK_LANGUAGES,
  type DueMode,
  type Kind,
  type WorkLanguage,
} from './rules';

export const MAX_INSTRUCTIONS = 20_000;

const scoreRange = 'Out of must be a whole number from 1 to 1000.';
const penaltyRange = 'The late penalty must be a whole number from 0 to 100.';
export const assessmentInputSchema = z.object({
  kind: z.enum(KINDS, { error: 'Choose classwork, homework or exam.' }),
  title: z.string().trim().min(1, 'Give the work a title.').max(120, 'Keep the title under 120 characters.'),
  instructionsMd: z.string().max(MAX_INSTRUCTIONS, `Keep the instructions under ${MAX_INSTRUCTIONS.toLocaleString('en')} characters.`),
  language: z.enum(WORK_LANGUAGES, { error: 'Choose a language, or paper / in class.' }),
  maxScore: z.coerce.number({ error: scoreRange }).int(scoreRange).min(1, scoreRange).max(1000, scoreRange),
  dueMode: z.enum(DUE_MODES, { error: 'Choose when it’s due.' }),
  dueDate: z.string().optional(),
  dueTime: z.string().optional(),
  allowLate: z.boolean(),
  latePenaltyPct: z.coerce.number({ error: penaltyRange }).int(penaltyRange).min(0, penaltyRange).max(100, penaltyRange),
  intent: z.enum(['draft', 'publish']),
});
export type AssessmentInput = z.input<typeof assessmentInputSchema>;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the day it’s due.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose the time it’s due.');

type Row = typeof assessment.$inferSelect;
export type WorkItem = {
  id: string;
  kind: Kind;
  title: string;
  instructionsMd: string;
  language: WorkLanguage;
  maxScore: number;
  dueMode: DueMode;
  dueAt: Date | null;
  due: Date | null;
  allowLate: boolean;
  latePenaltyPct: number;
  status: 'draft' | 'published';
};

async function weekSession(classId: string, week: number) {
  const sessions = await weeksOf(classId);
  const s = sessions.find((r) => r.week === week);
  if (!s) throw new ValidationError(`This class has no week ${week}.`);
  return { s, sessions };
}

const toItem = (a: Row, sessions: Awaited<ReturnType<typeof weeksOf>>, tz: string): WorkItem => ({
  id: a.id,
  kind: a.kind as Kind,
  title: a.title,
  instructionsMd: a.instructionsMd,
  language: a.language as WorkLanguage,
  maxScore: a.maxScore,
  dueMode: a.dueMode as DueMode,
  dueAt: a.dueAt,
  due: resolveDue({ sessionId: a.sessionId, dueMode: a.dueMode as DueMode, dueAt: a.dueAt }, sessions, tz),
  allowLate: a.allowLate,
  latePenaltyPct: a.latePenaltyPct,
  status: a.status as 'draft' | 'published',
});

const inSession = (sessionId: string) =>
  db.select().from(assessment).where(eq(assessment.sessionId, sessionId)).orderBy(asc(assessment.createdAt));

// A teacher's week: the work set in it and the "due" choices for new work.
export async function weekWork(actor: Actor | null, classId: string, week: number) {
  assertCan(actor, 'assessment.write', await classAccess(classId));
  const { s, sessions } = await weekSession(classId, week);
  const tz = (await getClubSettings()).timeZone;
  return {
    sessionId: s.id,
    choices: dueChoices(sessions, s.id),
    items: (await inSession(s.id)).map((a) => toItem(a, sessions, tz)),
  };
}

export async function saveAssessment(
  actor: Actor | null,
  sessionId: string,
  raw: AssessmentInput,
  assessmentId?: string,
): Promise<{ id: string }> {
  const [s] = await db.select().from(classSession).where(eq(classSession.id, sessionId)).limit(1);
  if (!s) throw new ValidationError('That session no longer exists.');
  assertCan(actor, 'assessment.write', await classAccess(s.classId));
  if (s.status === 'cancelled') throw new ValidationError('That session is cancelled, so no work can be set in it.');
  const parsed = assessmentInputSchema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  const input = parsed.data;

  let dueAt: Date | null = null;
  if (input.dueMode === 'fixed') {
    const d = isoDate.safeParse(input.dueDate ?? '');
    if (!d.success) throw new ValidationError(d.error.issues[0]!.message, 'dueDate');
    const t = time.safeParse(input.dueTime ?? '');
    if (!t.success) throw new ValidationError(t.error.issues[0]!.message, 'dueTime');
    dueAt = zonedToUtc(d.data, t.data, (await getClubSettings()).timeZone);
  } else if (input.dueMode === 'next_session' && !nextHeldSession(await weeksOf(s.classId), s.id)) {
    throw new ValidationError('This is the last session, so choose another day and time.', 'dueMode');
  }

  const values = {
    kind: input.kind,
    title: input.title,
    instructionsMd: input.instructionsMd,
    language: input.language,
    maxScore: input.maxScore,
    dueMode: input.dueMode,
    dueAt,
    allowLate: input.allowLate,
    latePenaltyPct: input.latePenaltyPct,
    status: input.intent === 'publish' ? 'published' : 'draft',
    authorId: actor.userId,
  };
  let id = assessmentId;
  if (id) {
    const updated = await db
      .update(assessment)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(assessment.id, id), eq(assessment.sessionId, sessionId)))
      .returning({ id: assessment.id });
    if (!updated.length) throw new ValidationError('That work no longer exists.');
  } else {
    id = crypto.randomUUID();
    await db.insert(assessment).values({ id, classId: s.classId, sessionId, ...values });
  }
  await audit({
    actorId: actor.userId,
    action: 'assessment.save',
    entity: 'assessment',
    entityId: id,
    detail: { classId: s.classId, date: s.date, kind: input.kind, status: values.status },
  });
  return { id };
}

export async function deleteAssessment(actor: Actor | null, assessmentId: string) {
  const [a] = await db.select().from(assessment).where(eq(assessment.id, assessmentId)).limit(1);
  if (!a) throw new ValidationError('That work no longer exists.');
  assertCan(actor, 'assessment.write', await classAccess(a.classId));
  await db.delete(assessment).where(eq(assessment.id, assessmentId));
  await audit({
    actorId: actor.userId,
    action: 'assessment.delete',
    entity: 'assessment',
    entityId: assessmentId,
    detail: { title: a.title },
  });
}

// The published work of a week, for a student in the class (BR-01).
export async function studentWeekWork(actor: Actor | null, classId: string, week: number): Promise<WorkItem[]> {
  assertCan(actor, 'assessment.read', await classAccess(classId));
  const { s, sessions } = await weekSession(classId, week);
  const tz = (await getClubSettings()).timeZone;
  return (await inSession(s.id)).filter((a) => a.status === 'published').map((a) => toItem(a, sessions, tz));
}

// All the class's published work, by week and then by when it's due: the student's class page.
export async function studentClassWork(actor: Actor | null, classId: string): Promise<(WorkItem & { week: number | null })[]> {
  assertCan(actor, 'assessment.read', await classAccess(classId));
  const sessions = await weeksOf(classId);
  const tz = (await getClubSettings()).timeZone;
  const rows = await db
    .select()
    .from(assessment)
    .where(and(eq(assessment.classId, classId), eq(assessment.status, 'published')));
  const weekOf = new Map(sessions.map((s) => [s.id, s.week]));
  return rows
    .map((a) => ({ ...toItem(a, sessions, tz), week: weekOf.get(a.sessionId) ?? null }))
    .sort((x, y) => (x.week ?? 0) - (y.week ?? 0) || (x.due?.getTime() ?? 0) - (y.due?.getTime() ?? 0));
}

export type AssessmentView = WorkItem & { classId: string; className: string; week: number | null; instructionsHtml: string };

// One piece of work: students see it once it's published; teachers of the class see drafts too.
export async function readAssessment(actor: Actor | null, assessmentId: string): Promise<AssessmentView> {
  const [a] = await db
    .select({ a: assessment, className: klass.name })
    .from(assessment)
    .innerJoin(klass, eq(klass.id, assessment.classId))
    .where(eq(assessment.id, assessmentId))
    .limit(1);
  if (!a) throw new ValidationError('That work no longer exists.');
  const access = await classAccess(a.a.classId);
  assertCan(actor, 'assessment.read', access);
  const teaches = (access.classTeacherIds ?? []).includes(actor.userId);
  if (a.a.status !== 'published' && !teaches) throw new ValidationError('That work no longer exists.');
  const sessions = await weeksOf(a.a.classId);
  const item = toItem(a.a, sessions, (await getClubSettings()).timeZone);
  return {
    ...item,
    classId: a.a.classId,
    className: a.className,
    week: sessions.find((s) => s.id === a.a.sessionId)?.week ?? null,
    instructionsHtml: renderMarkdown(a.a.instructionsMd),
  };
}
