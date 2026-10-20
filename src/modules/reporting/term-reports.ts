// Term reports (FR-TCH-15/16/17): one per student in a class. The class's teachers write them as drafts and
// confirm the result the score suggests (BR-13), then publish them all together. Publishing snapshots the
// numbers (BR-12), so a published report doesn't move when a mark changes; after that only Admin or the lead
// teacher may change one, with a reason, and the change takes the current numbers (BR-08).
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { enrolment, studentReport } from '@/db/schema';
import { classAccess } from '@/modules/academics/access';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { can } from '@/server/policy';
import { suggestedResult, type Result } from './rules';
import { loadStandings, type StudentStanding } from './standing';
import { checkTermReport, missingToPublish, type Rating, type TermReportInput } from './term-report-rules';

type Opts = { now?: Date };
type ReportRow = typeof studentReport.$inferSelect;

export type TermReportStatus = 'none' | 'draft' | 'published';
export type TermReportRow = {
  studentId: string;
  enrolmentId: string;
  name: string;
  live: number | null; // the overall score as it is now
  calculated: number | null; // the one the report uses: the snapshot once published, otherwise the live one
  parts: { exam: number | null; classwork: number | null; homework: number | null };
  finalScore: number | null; // set only when the teacher adjusted it
  score: number | null; // final ?? calculated
  suggested: Result | null;
  rating: Rating | null;
  comment: string;
  needsSupport: boolean;
  supportNote: string;
  result: Result | null;
  reason: string | null;
  status: TermReportStatus;
  publishedAt: Date | null;
};
export type TermReports = {
  classId: string;
  className: string;
  passMark: number;
  canWrite: boolean;
  canAmend: boolean;
  rows: TermReportRow[];
};

function toRow(s: StudentStanding, r: ReportRow | undefined, passMark: number): TermReportRow {
  const published = !!r?.publishedAt;
  const calculated = published ? r!.calculatedScore : s.overall.overall;
  const parts = published
    ? { exam: r!.examPct, classwork: r!.classworkPct, homework: r!.homeworkPct }
    : { exam: s.overall.exam, classwork: s.overall.classwork, homework: s.overall.homework };
  const finalScore = r?.finalScore ?? null;
  const score = finalScore ?? calculated;
  return {
    studentId: s.studentId,
    enrolmentId: s.enrolmentId,
    name: s.name,
    live: s.overall.overall,
    calculated,
    parts,
    finalScore,
    score,
    suggested: suggestedResult(score, passMark),
    rating: (r?.rating as Rating | null) ?? null,
    comment: r?.comment ?? '',
    needsSupport: r?.needsSupport ?? false,
    supportNote: r?.supportNote ?? '',
    result: (r?.result as Result | null) ?? null,
    reason: r?.reason ?? null,
    status: !r ? 'none' : published ? 'published' : 'draft',
    publishedAt: r?.publishedAt ?? null,
  };
}

async function load(classId: string, opts: Opts) {
  const standings = await loadStandings(classId, opts);
  const ids = standings.students.map((s) => s.enrolmentId);
  const reports = ids.length ? await db.select().from(studentReport).where(inArray(studentReport.enrolmentId, ids)) : [];
  const byEnrolment = new Map(reports.map((r) => [r.enrolmentId, r]));
  return {
    standings,
    reports: byEnrolment,
    rows: standings.students.map((s) => toRow(s, byEnrolment.get(s.enrolmentId), standings.passMark)),
  };
}

// The class's term reports: for its teachers and Admin.
export async function termReports(actor: Actor | null, classId: string, opts: Opts = {}): Promise<TermReports> {
  const access = await classAccess(classId);
  assertCan(actor, 'class.view', access);
  const { standings, rows } = await load(classId, opts);
  return {
    classId,
    className: standings.className,
    passMark: standings.passMark,
    canWrite: can(actor, 'termreport.write', access),
    canAmend: can(actor, 'termreport.amend', access),
    rows,
  };
}

const snapshot = (s: StudentStanding) => ({
  calculatedScore: s.overall.overall,
  examPct: s.overall.exam,
  classworkPct: s.overall.classwork,
  homeworkPct: s.overall.homework,
});
const summary = (r: TermReportRow) => ({ score: r.score, result: r.result, rating: r.rating, finalScore: r.finalScore });

// Saves one student's report: a draft by the class's teachers, or a change to a published one by Admin or the
// lead teacher, which needs a reason and takes the current numbers.
export async function saveTermReport(actor: Actor | null, enrolmentId: string, raw: TermReportInput, opts: Opts = {}) {
  const [e] = await db
    .select({ classId: enrolment.classId, studentId: enrolment.studentId, status: enrolment.status })
    .from(enrolment)
    .where(eq(enrolment.id, enrolmentId));
  if (!e) throw new ValidationError('That student isn’t in this class.');
  const access = await classAccess(e.classId);
  assertCan(actor, 'class.view', access);
  const { standings, reports, rows } = await load(e.classId, opts);
  const standing = standings.students.find((s) => s.enrolmentId === enrolmentId);
  if (!standing) throw new ValidationError('That student isn’t in this class.');
  const before = rows.find((r) => r.enrolmentId === enrolmentId)!;
  const existing = reports.get(enrolmentId);
  const published = !!existing?.publishedAt;
  assertCan(actor, published ? 'termreport.amend' : 'termreport.write', access);

  const fields = checkTermReport(raw, { calculated: standing.overall.overall, passMark: standings.passMark });
  const changeReason = raw.changeReason?.trim() ?? '';
  if (published) {
    if (!changeReason) throw new ValidationError('This report is published. Write why you are changing it.', 'changeReason');
    const missing = missingToPublish(fields, standing.overall.overall);
    if (missing.length) throw new ValidationError(`A published report needs ${missing.join(' and ')}.`);
  }
  const values = { ...fields, ...(published ? snapshot(standing) : {}), authorId: actor.userId, updatedAt: new Date() };
  await db
    .insert(studentReport)
    .values({ id: crypto.randomUUID(), enrolmentId, ...values })
    .onConflictDoUpdate({ target: studentReport.enrolmentId, set: values });

  const after = toRow(standing, { ...(existing ?? ({} as ReportRow)), ...values, enrolmentId } as ReportRow, standings.passMark);
  const detail = { classId: e.classId, studentId: e.studentId };
  if (published)
    await audit({
      actorId: actor.userId,
      action: 'termreport.amend',
      entity: 'student_report',
      entityId: enrolmentId,
      detail: { ...detail, changeReason, reason: fields.reason, before: summary(before), after: summary(after) },
    });
  else if (fields.reason)
    await audit({
      actorId: actor.userId,
      action: 'termreport.override',
      entity: 'student_report',
      entityId: enrolmentId,
      detail: { ...detail, ...summary(after), suggested: after.suggested, calculated: after.calculated, reason: fields.reason },
    });
}

// Publishes the class's draft reports together, or none of them: every student in the class needs a finished
// report first. Each report's numbers are snapshotted and each publish is logged.
export async function publishTermReports(actor: Actor | null, classId: string, opts: Opts = {}): Promise<{ published: number }> {
  assertCan(actor, 'termreport.write', await classAccess(classId));
  const { standings, rows } = await load(classId, opts);
  const toPublish = rows.filter((r) => r.status !== 'published');
  if (!toPublish.length) throw new ValidationError('Every report is already published.');
  const unfinished = toPublish
    .map((r) => ({ r, missing: r.status === 'none' ? ['a rating', 'a result'] : missingToPublish(r, r.calculated) }))
    .filter((x) => x.missing.length);
  if (unfinished.length)
    throw new ValidationError(`Finish these reports first: ${unfinished.map((x) => `${x.r.name} (${x.missing.join(', ')})`).join('; ')}.`);
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const r of toPublish) {
      const s = standings.students.find((x) => x.enrolmentId === r.enrolmentId)!;
      await tx
        .update(studentReport)
        .set({ ...snapshot(s), publishedAt: now, publishedBy: actor.userId })
        .where(eq(studentReport.enrolmentId, r.enrolmentId));
    }
  });
  for (const r of toPublish)
    await audit({
      actorId: actor.userId,
      action: 'termreport.publish',
      entity: 'student_report',
      entityId: r.enrolmentId,
      detail: { classId, studentId: r.studentId, score: r.score, result: r.result, finalScore: r.finalScore, calculated: r.calculated },
    });
  return { published: toPublish.length };
}
