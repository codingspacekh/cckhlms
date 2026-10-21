// The admin's report on one student (FR-ADM-09): for each class they're in or were in, their current standing,
// attendance and homework (classes they're in now), scores by task, improvement (BR-10), and the teacher's term
// report with any support flag; plus their published final scores term by term.
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { enrolment, klass, studentReport, term, user } from '@/db/schema';
import type { Actor } from '@/server/actor';
import { assertCan, ValidationError } from '@/server/errors';
import { improvement, termChanges } from './dashboard-rules';
import type { Result } from './rules';
import { loadStandings, type StudentStanding } from './standing';
import type { Rating } from './term-report-rules';

type Opts = { now?: Date };

export type AdminClassReport = {
  classId: string;
  className: string;
  termName: string;
  status: string; // the enrolment's: active / withdrawn / completed
  current: boolean;
  enrolledOn: string;
  classStart: string; // the class's first session
  passMark: number | null;
  standing: Omit<StudentStanding, 'tasks'> | null;
  tasks: StudentStanding['tasks'];
  improvement: ReturnType<typeof improvement>;
  report: {
    status: 'draft' | 'published';
    rating: Rating | null;
    comment: string;
    needsSupport: boolean;
    supportNote: string;
    result: Result | null;
    score: number | null;
  } | null;
};

export async function adminStudentReport(actor: Actor | null, studentId: string, opts: Opts = {}) {
  assertCan(actor, 'admin.area');
  const [student] = await db
    .select({ id: user.id, name: user.name, username: user.username, erasedAt: user.erasedAt })
    .from(user)
    .where(eq(user.id, studentId));
  if (!student) throw new ValidationError('That student no longer exists.');
  const rows = await db
    .select({
      enrolmentId: enrolment.id,
      classId: klass.id,
      className: klass.name,
      classStatus: klass.status,
      classStart: klass.firstDate,
      termName: term.name,
      termStart: term.startDate,
      termStatus: term.status,
      status: enrolment.status,
      enrolledOn: enrolment.enrolledOn,
      report: studentReport,
    })
    .from(enrolment)
    .innerJoin(klass, eq(klass.id, enrolment.classId))
    .innerJoin(term, eq(term.id, klass.termId))
    .leftJoin(studentReport, eq(studentReport.enrolmentId, enrolment.id))
    .where(eq(enrolment.studentId, studentId))
    .orderBy(asc(term.startDate), asc(klass.name));

  const classes: AdminClassReport[] = [];
  for (const r of rows) {
    const current = r.status === 'active' && r.classStatus === 'active' && r.termStatus !== 'closed';
    const standings = r.status === 'active' ? await loadStandings(r.classId, { ...opts, studentId }) : null;
    const mine = standings?.students[0] ?? null;
    const { tasks = [], ...standing } = mine ?? {};
    const scores = tasks.filter((t) => t.percent !== null).map((t) => t.percent!);
    const rep = r.report;
    classes.push({
      classId: r.classId,
      className: r.className,
      termName: r.termName,
      status: r.status,
      current,
      enrolledOn: r.enrolledOn,
      classStart: r.classStart,
      passMark: standings?.passMark ?? null,
      standing: mine ? (standing as Omit<StudentStanding, 'tasks'>) : null,
      tasks,
      improvement: improvement(scores),
      report: rep
        ? {
            status: rep.publishedAt ? 'published' : 'draft',
            rating: rep.rating as Rating | null,
            comment: rep.comment,
            needsSupport: rep.needsSupport,
            supportNote: rep.supportNote,
            result: rep.result as Result | null,
            score: rep.publishedAt ? (rep.finalScore ?? rep.calculatedScore) : null,
          }
        : null,
    });
  }
  const published = rows.flatMap((r) =>
    r.report?.publishedAt && (r.report.finalScore ?? r.report.calculatedScore) !== null
      ? [{ termName: r.termName, termStart: r.termStart, score: (r.report.finalScore ?? r.report.calculatedScore)! }]
      : [],
  );
  return {
    student: { id: student.id, name: student.name, username: student.username ?? '', erasedAt: student.erasedAt },
    classes,
    terms: termChanges(published),
  };
}
export type AdminStudentReport = Awaited<ReturnType<typeof adminStudentReport>>;
