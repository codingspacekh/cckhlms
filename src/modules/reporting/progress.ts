// A student's own progress (FR-STU-07): their standing in each class they're in now, their scores by task next to
// the class average (BR-11: only from enough scores that no classmate's mark shows through), their published
// term reports, and this term against their last one. Nothing about any other student leaves this module.
import { and, asc, eq, isNotNull, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { enrolment, klass, studentReport, term } from '@/db/schema';
import type { Kind } from '@/modules/assessments/rules';
import type { Actor } from '@/server/actor';
import { assertCan } from '@/server/errors';
import { classBand, lastTerm, type ClassBand } from './progress-rules';
import type { Result } from './rules';
import { loadStandings, type StudentStanding } from './standing';
import type { Rating } from './term-report-rules';

type Opts = { now?: Date };

export type MyTask = { id: string; title: string; kind: Kind; week: number | null; mine: number | null; classBand: ClassBand | null };
export type MyClassProgress = {
  classId: string;
  className: string;
  termName: string;
  passMark: number;
  standing: Omit<StudentStanding, 'tasks'>;
  tasks: MyTask[];
};
export type MyReport = {
  classId: string;
  className: string;
  termName: string;
  termStart: string;
  score: number;
  result: Result;
  rating: Rating;
  comment: string;
};

export async function myProgress(actor: Actor | null, opts: Opts = {}) {
  assertCan(actor, 'student.area');
  const me = actor.userId;
  const [current, published] = await Promise.all([
    db
      .select({ classId: klass.id, className: klass.name, termName: term.name, termStart: term.startDate })
      .from(enrolment)
      .innerJoin(klass, eq(klass.id, enrolment.classId))
      .innerJoin(term, eq(term.id, klass.termId))
      .where(and(eq(enrolment.studentId, me), eq(enrolment.status, 'active'), eq(klass.status, 'active'), ne(term.status, 'closed')))
      .orderBy(asc(klass.name)),
    db
      .select({
        classId: klass.id,
        className: klass.name,
        termId: term.id,
        termName: term.name,
        termStart: term.startDate,
        finalScore: studentReport.finalScore,
        calculatedScore: studentReport.calculatedScore,
        result: studentReport.result,
        rating: studentReport.rating,
        comment: studentReport.comment,
      })
      .from(studentReport)
      .innerJoin(enrolment, eq(enrolment.id, studentReport.enrolmentId))
      .innerJoin(klass, eq(klass.id, enrolment.classId))
      .innerJoin(term, eq(term.id, klass.termId))
      .where(and(eq(enrolment.studentId, me), isNotNull(studentReport.publishedAt)))
      .orderBy(asc(term.startDate), asc(klass.name)),
  ]);

  const classes: MyClassProgress[] = [];
  for (const c of current) {
    const s = await loadStandings(c.classId, opts);
    const mine = s.students.find((x) => x.studentId === me);
    if (!mine) continue;
    const { tasks: myTasks, ...standing } = mine;
    classes.push({
      classId: c.classId,
      className: c.className,
      termName: c.termName,
      passMark: s.passMark,
      standing,
      tasks: s.work.map((w) => ({
        id: w.id,
        title: w.title,
        kind: w.kind,
        week: w.week,
        mine: myTasks.find((t) => t.id === w.id)?.percent ?? null,
        classBand: classBand(s.students.map((x) => x.tasks.find((t) => t.id === w.id)?.percent ?? null)),
      })),
    });
  }

  const reports = published
    .map((r) => ({ ...r, score: r.finalScore ?? r.calculatedScore }))
    .filter((r): r is typeof r & { score: number } => r.score !== null);
  const thisTermStart = current.reduce((latest, c) => (c.termStart > latest ? c.termStart : latest), '');
  return {
    classes,
    reports: reports.map((r): MyReport => ({
      classId: r.classId,
      className: r.className,
      termName: r.termName,
      termStart: r.termStart,
      score: r.score,
      result: r.result as Result,
      rating: r.rating as Rating,
      comment: r.comment,
    })),
    lastTerm: lastTerm(reports, thisTermStart || '9999-12-31'),
  };
}
export type MyProgress = Awaited<ReturnType<typeof myProgress>>;
