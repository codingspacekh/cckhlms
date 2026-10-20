// Marking code work (FR-TCH-11/12): the teacher opens a student's latest version, gives a score and
// feedback, or returns it for a redo. Marks go on the latest version only (BR-04); older versions keep
// theirs as history.
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { enrolment, klass, submission, user } from '@/db/schema';
import type { ProjectFile } from '@/lib/project/files';
import { classAccess } from '@/modules/academics/access';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { codeWork } from './projects';
import { checkScore, markOf, type Mark, type WorkLanguage } from './rules';

export type GradingVersion = {
  version: number;
  submittedAt: Date;
  late: boolean;
  files: ProjectFile[];
  score: number | null;
  feedbackMd: string;
  gradedAt: Date | null;
  returnedAt: Date | null;
  byTeacher: boolean; // entered in the gradebook: no files
};
export type GradingView = {
  work: {
    id: string;
    classId: string;
    className: string;
    week: number | null;
    title: string;
    language: WorkLanguage;
    maxScore: number;
    latePenaltyPct: number;
  };
  student: { id: string; name: string; username: string };
  versions: GradingVersion[]; // newest first
  mark: Mark | null;
  // The students before and after this one in the class list, to move through the class quickly.
  prev: { id: string; name: string } | null;
  next: { id: string; name: string } | null;
};

async function teacherOf(actor: Actor | null, assessmentId: string) {
  const a = await codeWork(assessmentId);
  assertCan(actor, 'work.grade', await classAccess(a.classId));
  return { a, actor };
}

const versionsOf = (assessmentId: string, studentId: string) =>
  db
    .select()
    .from(submission)
    .where(and(eq(submission.assessmentId, assessmentId), eq(submission.studentId, studentId)))
    .orderBy(desc(submission.version));

async function studentName(studentId: string) {
  const [s] = await db.select({ name: user.name }).from(user).where(eq(user.id, studentId)).limit(1);
  return s?.name ?? 'This student';
}

// One student's work on one assessment, for marking.
export async function gradingView(actor: Actor | null, assessmentId: string, studentId: string): Promise<GradingView> {
  const { a } = await teacherOf(actor, assessmentId);
  const [roster, versions, [k], sessions] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, username: user.username })
      .from(enrolment)
      .innerJoin(user, eq(user.id, enrolment.studentId))
      .where(and(eq(enrolment.classId, a.classId), eq(enrolment.status, 'active')))
      .orderBy(asc(user.name)),
    versionsOf(assessmentId, studentId),
    db.select({ name: klass.name }).from(klass).where(eq(klass.id, a.classId)),
    weeksOf(a.classId),
  ]);
  const i = roster.findIndex((s) => s.id === studentId);
  if (i < 0) throw new ValidationError('That student isn’t in this class.');
  const pick = (s: (typeof roster)[number] | undefined) => (s ? { id: s.id, name: s.name } : null);
  return {
    work: {
      id: a.id,
      classId: a.classId,
      className: k?.name ?? '',
      week: sessions.find((s) => s.id === a.sessionId)?.week ?? null,
      title: a.title,
      language: a.language as WorkLanguage,
      maxScore: a.maxScore,
      latePenaltyPct: a.latePenaltyPct,
    },
    student: { id: roster[i]!.id, name: roster[i]!.name, username: roster[i]!.username ?? '' },
    versions: versions.map((v) => ({
      version: v.version,
      submittedAt: v.submittedAt,
      late: v.late,
      files: v.files,
      score: v.score,
      feedbackMd: v.feedbackMd,
      gradedAt: v.gradedAt,
      returnedAt: v.returnedAt,
      byTeacher: v.byTeacher,
    })),
    mark: markOf(versions[0] ?? null),
    prev: pick(roster[i - 1]),
    next: pick(roster[i + 1]),
  };
}

const feedbackSchema = z.string().max(5000, { error: 'Keep feedback under 5,000 characters.' });
const gradeSchema = z.object({ version: z.number().int().min(1), score: z.string(), feedbackMd: feedbackSchema });
const returnSchema = z.object({ version: z.number().int().min(1), feedbackMd: feedbackSchema });
function parse<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  return parsed.data;
}

// The version the teacher is looking at must still be the latest: a student may hand in again while the
// teacher reads (BR-04).
async function latestVersion(assessmentId: string, studentId: string, version: number) {
  const [latest] = await versionsOf(assessmentId, studentId).limit(1);
  if (!latest) throw new ValidationError(`${await studentName(studentId)} hasn’t handed anything in.`);
  if (latest.version !== version)
    throw new ValidationError(
      `${await studentName(studentId)} handed in version ${latest.version} after you opened this. Reload to mark the latest.`,
    );
  return latest;
}

export async function gradeSubmission(actor: Actor | null, assessmentId: string, studentId: string, raw: z.input<typeof gradeSchema>) {
  const { a } = await teacherOf(actor, assessmentId);
  const input = parse(gradeSchema, raw);
  const score = checkScore(input.score, a.maxScore);
  const latest = await latestVersion(assessmentId, studentId, input.version);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(submission)
      .set({ score, feedbackMd: input.feedbackMd.trim(), gradedBy: actor!.userId, gradedAt: now, returnedAt: null })
      .where(eq(submission.id, latest.id));
    await audit(
      {
        actorId: actor!.userId,
        action: 'submission.grade',
        entity: 'submission',
        entityId: latest.id,
        detail: { assessmentId, studentId, version: latest.version, score, previousScore: latest.score },
      },
      tx,
    );
  });
}

// FR-TCH-12: send it back with a note; the student can hand it in again, even after the due time.
export async function returnSubmission(actor: Actor | null, assessmentId: string, studentId: string, raw: z.input<typeof returnSchema>) {
  await teacherOf(actor, assessmentId);
  const input = parse(returnSchema, raw);
  const note = input.feedbackMd.trim();
  if (!note) throw new ValidationError('Say what to change, so they know what to redo.', 'feedbackMd');
  const latest = await latestVersion(assessmentId, studentId, input.version);
  await db.transaction(async (tx) => {
    await tx
      .update(submission)
      .set({ score: null, feedbackMd: note, gradedBy: actor!.userId, gradedAt: sql`now()`, returnedAt: sql`now()` })
      .where(eq(submission.id, latest.id));
    await audit(
      {
        actorId: actor!.userId,
        action: 'submission.return',
        entity: 'submission',
        entityId: latest.id,
        detail: { assessmentId, studentId, version: latest.version, previousScore: latest.score },
      },
      tx,
    );
  });
}
