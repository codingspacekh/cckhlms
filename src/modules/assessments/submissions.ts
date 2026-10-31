// Handing in code work (FR-STU-05) and the teacher's list of who has (FR-TCH-10). Each submission is a
// snapshot of the student's project; the latest counts (BR-04). Late is fixed when submitted (BR-03);
// "missing" is worked out when read. Marks live on the version they were given to (grading.ts).
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { enrolment, excusal, submission, user, workDraft } from '@/db/schema';
import type { ProjectFile } from '@/lib/project/files';
import { renderMarkdown } from '@/lib/markdown';
import { classAccess, enrolledOrCompleted } from '@/modules/academics/access';
import { getClubSettings } from '@/modules/club/service';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, isUniqueViolation, ValidationError } from '@/server/errors';
import { codeWork, starterOf, validFiles } from './projects';
import { submissionMeta } from './submission-columns';
import { afterPenalty, canSubmit, markOf, resolveDue, workStatus, type DueMode, type Mark, type WorkStatus } from './rules';

type Opts = { now?: Date };

async function dueOf(a: { classId: string; sessionId: string; dueMode: string; dueAt: Date | null }) {
  const tz = (await getClubSettings()).timeZone;
  return { due: resolveDue({ sessionId: a.sessionId, dueMode: a.dueMode as DueMode, dueAt: a.dueAt }, await weeksOf(a.classId), tz), tz };
}

// A student's versions of one piece of work, newest first, without their files.
async function versionsOf(assessmentId: string, studentId: string) {
  return db
    .select(submissionMeta)
    .from(submission)
    .where(and(eq(submission.assessmentId, assessmentId), eq(submission.studentId, studentId)))
    .orderBy(desc(submission.version));
}

// The files of the student's latest hand-in (a mark entered in the gradebook has none).
async function lastHandInFiles(assessmentId: string, studentId: string) {
  const [row] = await db
    .select({ files: submission.files })
    .from(submission)
    .where(and(eq(submission.assessmentId, assessmentId), eq(submission.studentId, studentId), eq(submission.byTeacher, false)))
    .orderBy(desc(submission.version))
    .limit(1);
  return row?.files ?? null;
}

// The same files in the same places, whatever order they were saved in.
const sameFiles = (a: ProjectFile[], b: ProjectFile[]) => {
  const key = (fs: ProjectFile[]) => JSON.stringify([...fs].sort((x, y) => x.path.localeCompare(y.path)).map((f) => [f.path, f.content]));
  return key(a) === key(b);
};

// The student's saved draft (or the starter files) becomes the next version.
export async function submitWork(actor: Actor | null, assessmentId: string, opts: Opts = {}): Promise<{ version: number; late: boolean }> {
  const a = await codeWork(assessmentId);
  assertCan(actor, 'work.submit', await classAccess(a.classId));
  if (a.status !== 'published') throw new ValidationError('That work no longer exists.');
  const now = opts.now ?? new Date();
  const [{ due }, versions, [draft], lastFiles] = await Promise.all([
    dueOf(a),
    versionsOf(assessmentId, actor.userId),
    db
      .select({ files: workDraft.files })
      .from(workDraft)
      .where(and(eq(workDraft.assessmentId, assessmentId), eq(workDraft.studentId, actor.userId))),
    lastHandInFiles(assessmentId, actor.userId),
  ]);
  const last = versions[0];
  const previous = last?.version ?? 0;
  const allowed = canSubmit({
    due,
    now,
    allowLate: a.allowLate,
    submitted: !!last,
    mark: markOf(last ?? null),
    lastLate: last?.late,
    handIns: versions.filter((v) => !v.byTeacher).length,
  });
  if (!allowed.ok) throw new ValidationError(allowed.reason);
  const files = validFiles(draft?.files ?? starterOf(a));
  if (lastFiles && sameFiles(files, lastFiles)) throw new ValidationError('Nothing has changed since your last hand-in.');
  const version = previous + 1;
  const id = crypto.randomUUID();
  await db
    .transaction(async (tx) => {
      await tx
        .insert(submission)
        .values({ id, assessmentId, studentId: actor.userId, version, files, late: allowed.late, submittedAt: now });
      await audit(
        {
          actorId: actor.userId,
          action: 'submission.submit',
          entity: 'submission',
          entityId: id,
          detail: { assessmentId, version, late: allowed.late },
        },
        tx,
      );
    })
    .catch((err) => {
      // Another click handed in this version first.
      if (isUniqueViolation(err, 'submission_version_unique')) throw new ValidationError('This was just handed in. Reload to see it.');
      throw err;
    });
  return { version, late: allowed.late };
}

export type MyVersion = {
  version: number;
  submittedAt: Date;
  late: boolean;
  score: number | null;
  counts: number | null; // the score after any late penalty (BR-14)
  feedbackHtml: string;
  returned: boolean;
  byTeacher: boolean; // a mark the teacher entered in the gradebook, with no files
};
export type MySubmissions = {
  due: Date | null;
  next: ReturnType<typeof canSubmit>;
  mark: Mark | null;
  versions: MyVersion[];
};

// What a student has handed in for one piece of work, newest first, with their marks and feedback
// (FR-STU-06), and whether they can submit now. Only ever their own (BR-11).
export async function mySubmissions(actor: Actor | null, assessmentId: string, opts: Opts = {}): Promise<MySubmissions> {
  const a = await codeWork(assessmentId);
  assertCan(actor, 'work.submit', await classAccess(a.classId, 'read'));
  const [{ due }, rows] = await Promise.all([dueOf(a), versionsOf(assessmentId, actor.userId)]);
  const latest = rows[0] ?? null;
  return {
    due,
    mark: markOf(latest),
    next: canSubmit({
      due,
      now: opts.now ?? new Date(),
      allowLate: a.allowLate,
      submitted: rows.length > 0,
      mark: markOf(latest),
      lastLate: latest?.late,
      handIns: rows.filter((r) => !r.byTeacher).length,
    }),
    versions: rows.map((r) => ({
      version: r.version,
      submittedAt: r.submittedAt,
      late: r.late,
      score: r.score,
      counts: r.score === null ? null : afterPenalty(r.score, { late: r.late, latePenaltyPct: a.latePenaltyPct }),
      feedbackHtml: r.feedbackMd ? renderMarkdown(r.feedbackMd) : '',
      returned: !!r.returnedAt,
      byTeacher: r.byTeacher,
    })),
  };
}

export type SubmissionRow = {
  studentId: string;
  name: string;
  status: WorkStatus;
  versions: number;
  latest: { version: number; submittedAt: Date; late: boolean } | null;
  mark: Mark | null;
  score: number | null; // as given, before any late penalty
};

// Every student in the class now, with their status on this work (FR-TCH-10).
export async function submissionList(actor: Actor | null, assessmentId: string, opts: Opts = {}) {
  const a = await codeWork(assessmentId);
  assertCan(actor, 'assessment.write', await classAccess(a.classId, 'read'));
  const now = opts.now ?? new Date();
  const [{ due, tz }, students, subs] = await Promise.all([
    dueOf(a),
    db
      .select({ id: user.id, name: user.name, enrolledOn: enrolment.enrolledOn })
      .from(enrolment)
      .innerJoin(user, eq(user.id, enrolment.studentId))
      .where(and(eq(enrolment.classId, a.classId), enrolledOrCompleted))
      .orderBy(asc(user.name)),
    db
      .select({
        studentId: submission.studentId,
        version: submission.version,
        submittedAt: submission.submittedAt,
        late: submission.late,
        score: submission.score,
        returnedAt: submission.returnedAt,
        byTeacher: submission.byTeacher,
      })
      .from(submission)
      .where(eq(submission.assessmentId, assessmentId))
      .orderBy(desc(submission.version)),
  ]);
  const rows: SubmissionRow[] = students.map((s) => {
    const mine = subs.filter((x) => x.studentId === s.id);
    const top = mine[0];
    // A mark entered in the gradebook for work never handed in isn't a hand-in.
    const latest = top && !top.byTeacher ? { version: top.version, submittedAt: top.submittedAt, late: top.late } : null;
    const mark = markOf(top ?? null);
    return {
      studentId: s.id,
      name: s.name,
      versions: mine.filter((x) => !x.byTeacher).length,
      latest,
      mark,
      score: mark === 'graded' ? top!.score : null,
      status: workStatus({ latest, due, now, enrolledOn: s.enrolledOn, tz }),
    };
  });
  const counts: Record<WorkStatus, number> = { submitted: 0, late: 0, missing: 0, not_due: 0, excused: 0 };
  for (const r of rows) counts[r.status]++;
  return { due, rows, counts, toMark: rows.filter((r) => r.mark === 'to_mark').length };
}

export type MyStanding = { status: WorkStatus; mark: Mark | null; score: number | null };

// Where a student stands on each piece of work in their class (their own only, BR-11): handed in, marked,
// returned, or missing. Paper work marked in the gradebook shows here too.
export async function myStanding(
  actor: Actor | null,
  classId: string,
  items: { id: string; due: Date | null }[],
  opts: Opts = {},
): Promise<Map<string, MyStanding>> {
  assertCan(actor, 'work.submit', await classAccess(classId, 'read'));
  const now = opts.now ?? new Date();
  const ids = items.map((i) => i.id);
  const [{ timeZone: tz }, [enrolled], subs, excused] = await Promise.all([
    getClubSettings(),
    db
      .select({ enrolledOn: enrolment.enrolledOn })
      .from(enrolment)
      .where(and(eq(enrolment.classId, classId), eq(enrolment.studentId, actor.userId), eq(enrolment.status, 'active'))),
    ids.length
      ? db
          .select({
            assessmentId: submission.assessmentId,
            late: submission.late,
            score: submission.score,
            returnedAt: submission.returnedAt,
          })
          .from(submission)
          .where(and(eq(submission.studentId, actor.userId), inArray(submission.assessmentId, ids)))
          .orderBy(desc(submission.version))
      : [],
    ids.length
      ? db
          .select({ assessmentId: excusal.assessmentId })
          .from(excusal)
          .where(and(eq(excusal.studentId, actor.userId), inArray(excusal.assessmentId, ids)))
      : [],
  ]);
  const isExcused = new Set(excused.map((e) => e.assessmentId));
  const out = new Map<string, MyStanding>();
  for (const item of items) {
    if (isExcused.has(item.id)) {
      out.set(item.id, { status: 'excused', mark: null, score: null });
      continue;
    }
    const top = subs.find((x) => x.assessmentId === item.id);
    const mark = markOf(top ?? null);
    out.set(item.id, {
      status: workStatus({ latest: top ?? null, due: item.due, now, enrolledOn: enrolled?.enrolledOn ?? '', tz }),
      mark,
      score: mark === 'graded' ? top!.score : null,
    });
  }
  return out;
}
