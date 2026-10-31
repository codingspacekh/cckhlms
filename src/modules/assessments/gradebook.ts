// The gradebook (FR-TCH-19): the class's students × its published work. The teacher types a score, "ex" to
// excuse, or nothing to clear, cell by cell; each cell saves on its own. Scores for paper work (or for code
// work never handed in) become submissions without files, entered by the teacher, so marks live in one
// place for both grading screens. Each student's current overall score follows BR-12.
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { assessment, course, enrolment, excusal, klass, submission, user } from '@/db/schema';
import { renderMarkdown } from '@/lib/markdown';
import { classAccess, enrolledOrCompleted } from '@/modules/academics/access';
import { getClubSettings } from '@/modules/club/service';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { audit, type Executor } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import {
  afterPenalty,
  cellOf,
  overallScore,
  parseCell,
  pointsOf,
  resolveDue,
  type CellState,
  type DueMode,
  type Kind,
  type WorkLanguage,
} from './rules';
import { submissionMeta, type SubmissionMeta } from './submission-columns';

type Opts = { now?: Date };
type Latest = SubmissionMeta;
type AssessmentRow = typeof assessment.$inferSelect;
type Sessions = Awaited<ReturnType<typeof weeksOf>>;

export type GradebookWork = {
  id: string;
  title: string;
  kind: Kind;
  language: WorkLanguage;
  maxScore: number;
  latePenaltyPct: number;
  week: number | null;
  due: Date | null;
};
export type GradebookCell = {
  state: CellState;
  late: boolean;
  score: number | null; // as given
  points: number | null; // what it adds to the overall score: after the late penalty, 0 if missing
  comment: string;
  version: number | null; // the latest version, which a change applies to (BR-04)
  byTeacher: boolean;
};
export type Overall = ReturnType<typeof overallScore>;
export type GradebookRow = {
  id: string;
  name: string;
  enrolmentId: string;
  enrolledOn: string;
  cells: Record<string, GradebookCell>;
  overall: Overall;
};
export type Gradebook = { classId: string; className: string; passMark: number; work: GradebookWork[]; rows: GradebookRow[] };

const toWork = (a: AssessmentRow, sessions: Sessions, tz: string): GradebookWork => ({
  id: a.id,
  title: a.title,
  kind: a.kind as Kind,
  language: a.language as WorkLanguage,
  maxScore: a.maxScore,
  latePenaltyPct: a.latePenaltyPct,
  week: sessions.find((s) => s.id === a.sessionId)?.week ?? null,
  due: resolveDue({ sessionId: a.sessionId, dueMode: a.dueMode as DueMode, dueAt: a.dueAt }, sessions, tz),
});

function toCell(w: GradebookWork, latest: Latest | undefined, excused: boolean, enrolledOn: string, now: Date, tz: string) {
  const c = cellOf({ latest: latest ?? null, excused, due: w.due, now, enrolledOn, tz });
  const score = latest?.score ?? null;
  return {
    ...c,
    score,
    points: pointsOf(c, score, w.latePenaltyPct),
    comment: latest?.feedbackMd ?? '',
    version: latest?.version ?? null,
    byTeacher: latest?.byTeacher ?? false,
  } satisfies GradebookCell;
}

const overallOf = (work: GradebookWork[], cells: Record<string, GradebookCell>) =>
  overallScore(work.map((w) => ({ kind: w.kind, maxScore: w.maxScore, points: cells[w.id]!.points })));

// Everything the table needs for one class, or for one student in it. Not checked: callers check who's asking
// (reports read it too, so every screen shows the same marks).
export async function loadGradebook(classId: string, opts: Opts & { studentId?: string }) {
  const now = opts.now ?? new Date();
  const [{ timeZone: tz }, sessions, [k], students, rows] = await Promise.all([
    getClubSettings(),
    weeksOf(classId),
    db
      .select({ name: klass.name, passMark: course.passMark })
      .from(klass)
      .innerJoin(course, eq(course.id, klass.courseId))
      .where(eq(klass.id, classId)),
    db
      .select({ id: user.id, name: user.name, enrolmentId: enrolment.id, enrolledOn: enrolment.enrolledOn })
      .from(enrolment)
      .innerJoin(user, eq(user.id, enrolment.studentId))
      .where(and(eq(enrolment.classId, classId), enrolledOrCompleted, opts.studentId ? eq(enrolment.studentId, opts.studentId) : undefined))
      .orderBy(asc(user.name)),
    db
      .select()
      .from(assessment)
      .where(and(eq(assessment.classId, classId), eq(assessment.status, 'published'))),
  ]);
  const work = rows
    .map((a) => toWork(a, sessions, tz))
    .sort(
      (x, y) =>
        (x.week ?? 99) - (y.week ?? 99) ||
        (x.due?.getTime() ?? Infinity) - (y.due?.getTime() ?? Infinity) ||
        x.title.localeCompare(y.title),
    );
  const ids = work.map((w) => w.id);
  const studentIds = students.map((s) => s.id);
  const [subs, excused] =
    ids.length && studentIds.length
      ? await Promise.all([
          db
            .select(submissionMeta)
            .from(submission)
            .where(and(inArray(submission.assessmentId, ids), inArray(submission.studentId, studentIds)))
            .orderBy(desc(submission.version)),
          db
            .select({ assessmentId: excusal.assessmentId, studentId: excusal.studentId })
            .from(excusal)
            .where(and(inArray(excusal.assessmentId, ids), inArray(excusal.studentId, studentIds))),
        ])
      : [[], []];
  const latest = new Map<string, Latest>();
  for (const s of subs) if (!latest.has(`${s.assessmentId}:${s.studentId}`)) latest.set(`${s.assessmentId}:${s.studentId}`, s);
  const isExcused = new Set(excused.map((e) => `${e.assessmentId}:${e.studentId}`));
  const out: GradebookRow[] = students.map((s) => {
    const cells: Record<string, GradebookCell> = {};
    for (const w of work) {
      const key = `${w.id}:${s.id}`;
      cells[w.id] = toCell(w, latest.get(key), isExcused.has(key), s.enrolledOn, now, tz);
    }
    return { id: s.id, name: s.name, enrolmentId: s.enrolmentId, enrolledOn: s.enrolledOn, cells, overall: overallOf(work, cells) };
  });
  return { className: k?.name ?? '', passMark: k?.passMark ?? 60, work, rows: out };
}

export async function gradebook(actor: Actor | null, classId: string, opts: Opts = {}): Promise<Gradebook> {
  assertCan(actor, 'work.grade', await classAccess(classId, 'read'));
  return { classId, ...(await loadGradebook(classId, opts)) };
}

const cellSchema = z.object({ value: z.string().max(20), version: z.number().int().min(1).nullable() });
const commentSchema = z.object({
  comment: z.string().max(2000, { error: 'Keep the comment under 2,000 characters.' }),
  version: z.number().int().min(1).nullable(),
});
function parse<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  return parsed.data;
}

// The work and the student behind one cell, checked: the teacher teaches the class and the student is in it,
// and the version the teacher saw is still the latest (BR-04).
async function target(actor: Actor | null, assessmentId: string, studentId: string, version: number | null) {
  const [a] = await db.select().from(assessment).where(eq(assessment.id, assessmentId)).limit(1);
  if (!a) throw new ValidationError('That work no longer exists.');
  const access = await classAccess(a.classId);
  assertCan(actor, 'work.grade', access);
  if (!(access.classStudentIds ?? []).includes(studentId)) throw new ValidationError('That student isn’t in this class.');
  const [latest] = await db
    .select(submissionMeta)
    .from(submission)
    .where(and(eq(submission.assessmentId, assessmentId), eq(submission.studentId, studentId)))
    .orderBy(desc(submission.version))
    .limit(1);
  if ((latest?.version ?? null) !== version) {
    const [s] = await db.select({ name: user.name }).from(user).where(eq(user.id, studentId));
    throw new ValidationError(
      latest
        ? `${s?.name ?? 'This student'} handed in version ${latest.version} after the gradebook loaded. Reload to see it.`
        : 'This mark was cleared after the gradebook loaded. Reload to see it.',
    );
  }
  return { a, actor, latest };
}

async function cellAndOverall(classId: string, assessmentId: string, studentId: string, opts: Opts) {
  const one = await loadGradebook(classId, { ...opts, studentId });
  const row = one.rows[0]!;
  return { cell: row.cells[assessmentId]!, overall: row.overall };
}

// One cell: a score, "ex" to excuse, or empty to clear. Returns the cell as it now reads, and the student's
// new overall score.
export async function saveCell(
  actor: Actor | null,
  assessmentId: string,
  studentId: string,
  raw: z.input<typeof cellSchema>,
  opts: Opts = {},
): Promise<{ cell: GradebookCell; overall: Overall }> {
  const input = parse(cellSchema, raw);
  const { a, actor: teacher, latest } = await target(actor, assessmentId, studentId, input.version);
  const typed = parseCell(input.value, a.maxScore);
  await db.transaction(async (tx) => {
    await writeCell(tx, { assessmentId, studentId, teacherId: teacher!.userId, typed, latest });
    await audit(
      {
        actorId: teacher!.userId,
        action: 'gradebook.cell',
        entity: 'assessment',
        entityId: assessmentId,
        detail: { assessmentId, studentId, value: input.value.trim(), previousScore: latest?.score ?? null },
      },
      tx,
    );
  });
  return cellAndOverall(a.classId, assessmentId, studentId, opts);
}

async function writeCell(
  tx: Executor,
  c: { assessmentId: string; studentId: string; teacherId: string; typed: ReturnType<typeof parseCell>; latest: Latest | undefined },
) {
  const { assessmentId, studentId, typed, latest } = c;
  if (typed.kind === 'excuse') {
    await tx.insert(excusal).values({ assessmentId, studentId, excusedBy: c.teacherId }).onConflictDoNothing();
    return;
  }
  await tx.delete(excusal).where(and(eq(excusal.assessmentId, assessmentId), eq(excusal.studentId, studentId)));
  if (typed.kind === 'clear') {
    if (!latest) return;
    // A teacher-entered score has nothing of the student's in it, so it goes; a project goes back to "to mark".
    if (latest.byTeacher) await tx.delete(submission).where(eq(submission.id, latest.id));
    else await tx.update(submission).set({ score: null, gradedBy: null, gradedAt: null }).where(eq(submission.id, latest.id));
    return;
  }
  const now = new Date();
  if (latest)
    await tx
      .update(submission)
      .set({ score: typed.score, gradedBy: c.teacherId, gradedAt: now, returnedAt: null })
      .where(eq(submission.id, latest.id));
  else
    await tx.insert(submission).values({
      id: crypto.randomUUID(),
      assessmentId,
      studentId,
      version: 1,
      files: [],
      byTeacher: true,
      score: typed.score,
      gradedBy: c.teacherId,
      gradedAt: now,
      submittedAt: now,
    });
}

// A short comment on a marked cell: the same feedback the student sees on the marking page.
export async function saveComment(actor: Actor | null, assessmentId: string, studentId: string, raw: z.input<typeof commentSchema>) {
  const input = parse(commentSchema, raw);
  const { actor: teacher, latest } = await target(actor, assessmentId, studentId, input.version);
  if (!latest) throw new ValidationError('Enter a score first.');
  await db.transaction(async (tx) => {
    await tx.update(submission).set({ feedbackMd: input.comment.trim() }).where(eq(submission.id, latest.id));
    await audit(
      {
        actorId: teacher!.userId,
        action: 'gradebook.comment',
        entity: 'submission',
        entityId: latest.id,
        detail: { assessmentId, studentId },
      },
      tx,
    );
  });
}

// A student's own mark on one piece of work, for work with no editor (paper) (FR-STU-06, BR-11).
export async function myMark(
  actor: Actor | null,
  assessmentId: string,
): Promise<{ state: 'graded' | 'excused' | null; score: number | null; counts: number | null; feedbackHtml: string }> {
  const [a] = await db.select().from(assessment).where(eq(assessment.id, assessmentId)).limit(1);
  if (!a) throw new ValidationError('That work no longer exists.');
  assertCan(actor, 'work.submit', await classAccess(a.classId, 'read'));
  const [[latest], [excused]] = await Promise.all([
    db
      .select(submissionMeta)
      .from(submission)
      .where(and(eq(submission.assessmentId, assessmentId), eq(submission.studentId, actor.userId)))
      .orderBy(desc(submission.version))
      .limit(1),
    db
      .select({ at: excusal.excusedAt })
      .from(excusal)
      .where(and(eq(excusal.assessmentId, assessmentId), eq(excusal.studentId, actor.userId))),
  ]);
  const none = { score: null, counts: null, feedbackHtml: '' };
  if (excused) return { state: 'excused', ...none };
  if (!latest || latest.score === null || latest.returnedAt) return { state: null, ...none };
  return {
    state: 'graded',
    score: latest.score,
    counts: afterPenalty(latest.score, { late: latest.late, latePenaltyPct: a.latePenaltyPct }),
    feedbackHtml: latest.feedbackMd ? renderMarkdown(latest.feedbackMd) : '',
  };
}
