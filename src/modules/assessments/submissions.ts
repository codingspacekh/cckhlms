// Handing in code work (FR-STU-05) and the teacher's list of who has (FR-TCH-10). Each submission is a
// snapshot of the student's project; the latest counts (BR-04). Late is fixed when submitted (BR-03);
// "missing" is worked out when read.
import { and, asc, desc, eq, max } from 'drizzle-orm';
import { db } from '@/db/client';
import { enrolment, submission, user, workDraft } from '@/db/schema';
import type { ProjectFile } from '@/lib/project/files';
import { classAccess } from '@/modules/academics/access';
import { getClubSettings } from '@/modules/club/service';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { codeWork, starterOf, validFiles } from './projects';
import { canSubmit, resolveDue, workStatus, type DueMode, type WorkStatus } from './rules';

type Opts = { now?: Date };

async function dueOf(a: { classId: string; sessionId: string; dueMode: string; dueAt: Date | null }) {
  const tz = (await getClubSettings()).timeZone;
  return { due: resolveDue({ sessionId: a.sessionId, dueMode: a.dueMode as DueMode, dueAt: a.dueAt }, await weeksOf(a.classId), tz), tz };
}

async function versionsOf(assessmentId: string, studentId: string) {
  return db
    .select()
    .from(submission)
    .where(and(eq(submission.assessmentId, assessmentId), eq(submission.studentId, studentId)))
    .orderBy(desc(submission.version));
}

// The student's saved draft (or the starter files) becomes the next version.
export async function submitWork(actor: Actor | null, assessmentId: string, opts: Opts = {}): Promise<{ version: number; late: boolean }> {
  const a = await codeWork(assessmentId);
  assertCan(actor, 'work.submit', await classAccess(a.classId));
  if (a.status !== 'published') throw new ValidationError('That work no longer exists.');
  const now = opts.now ?? new Date();
  const [{ due }, [last], [draft]] = await Promise.all([
    dueOf(a),
    db
      .select({ version: max(submission.version) })
      .from(submission)
      .where(and(eq(submission.assessmentId, assessmentId), eq(submission.studentId, actor.userId))),
    db
      .select({ files: workDraft.files })
      .from(workDraft)
      .where(and(eq(workDraft.assessmentId, assessmentId), eq(workDraft.studentId, actor.userId))),
  ]);
  const previous = last?.version ?? 0;
  const allowed = canSubmit({ due, now, allowLate: a.allowLate, submitted: previous > 0 });
  if (!allowed.ok) throw new ValidationError(allowed.reason);
  const files = validFiles(draft?.files ?? starterOf(a));
  const version = previous + 1;
  const id = crypto.randomUUID();
  await db.insert(submission).values({ id, assessmentId, studentId: actor.userId, version, files, late: allowed.late, submittedAt: now });
  await audit({
    actorId: actor.userId,
    action: 'submission.submit',
    entity: 'submission',
    entityId: id,
    detail: { assessmentId, version, late: allowed.late },
  });
  return { version, late: allowed.late };
}

export type MySubmissions = {
  due: Date | null;
  next: ReturnType<typeof canSubmit>;
  versions: { version: number; submittedAt: Date; late: boolean; files: ProjectFile[] }[];
};

// What a student has handed in for one piece of work, newest first, and whether they can submit now.
export async function mySubmissions(actor: Actor | null, assessmentId: string, opts: Opts = {}): Promise<MySubmissions> {
  const a = await codeWork(assessmentId);
  assertCan(actor, 'work.submit', await classAccess(a.classId));
  const [{ due }, rows] = await Promise.all([dueOf(a), versionsOf(assessmentId, actor.userId)]);
  return {
    due,
    next: canSubmit({ due, now: opts.now ?? new Date(), allowLate: a.allowLate, submitted: rows.length > 0 }),
    versions: rows.map((r) => ({ version: r.version, submittedAt: r.submittedAt, late: r.late, files: r.files })),
  };
}

export type SubmissionRow = {
  studentId: string;
  name: string;
  status: WorkStatus;
  versions: number;
  latest: { version: number; submittedAt: Date; late: boolean } | null;
};

// Every student in the class now, with their status on this work (FR-TCH-10).
export async function submissionList(actor: Actor | null, assessmentId: string, opts: Opts = {}) {
  const a = await codeWork(assessmentId);
  assertCan(actor, 'assessment.write', await classAccess(a.classId));
  const now = opts.now ?? new Date();
  const [{ due, tz }, students, subs] = await Promise.all([
    dueOf(a),
    db
      .select({ id: user.id, name: user.name, enrolledOn: enrolment.enrolledOn })
      .from(enrolment)
      .innerJoin(user, eq(user.id, enrolment.studentId))
      .where(and(eq(enrolment.classId, a.classId), eq(enrolment.status, 'active')))
      .orderBy(asc(user.name)),
    db
      .select({ studentId: submission.studentId, version: submission.version, submittedAt: submission.submittedAt, late: submission.late })
      .from(submission)
      .where(eq(submission.assessmentId, assessmentId))
      .orderBy(desc(submission.version)),
  ]);
  const rows: SubmissionRow[] = students.map((s) => {
    const mine = subs.filter((x) => x.studentId === s.id);
    const latest = mine[0] ? { version: mine[0].version, submittedAt: mine[0].submittedAt, late: mine[0].late } : null;
    return {
      studentId: s.id,
      name: s.name,
      versions: mine.length,
      latest,
      status: workStatus({ latest, due, now, enrolledOn: s.enrolledOn, tz }),
    };
  });
  const counts: Record<WorkStatus, number> = { submitted: 0, late: 0, missing: 0, not_due: 0, excused: 0 };
  for (const r of rows) counts[r.status]++;
  return { due, rows, counts };
}
