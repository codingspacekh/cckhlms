// Term-end promotion (FR-ADM-13, BR-07): the wizard moves a class's students on. Passed students go to the
// next-level class, the others to a repeat class (or leave the club). Everything happens in one transaction:
// new enrolments, the old ones marked completed, the old class archived, one audit row. Nothing is deleted.
import { and, asc, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { classTeacher, course, enrolment, klass, studentReport, term, user } from '@/db/schema';
import { scheduleLabel, todayIn, type Day } from '@/modules/academics/schedule';
import { latestStartedTerms } from '@/modules/academics/terms';
import { getClubSettings } from '@/modules/club/service';
import { loadTermReports } from '@/modules/reporting/term-reports';
import type { Result } from '@/modules/reporting/rules';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';

type Opts = { now?: Date };

export type PromotionOption = {
  id: string;
  name: string;
  courseName: string;
  termName: string;
  schedule: string;
  teacher: string | null;
};
export type PromotionStudent = {
  enrolmentId: string;
  studentId: string;
  name: string;
  score: number | null;
  result: Result | null;
  target: string | null; // the class pre-selected for them; null = leaves the club
};
export type PromotionPlan = {
  classId: string;
  className: string;
  courseName: string;
  termName: string;
  published: boolean; // every student's term report is published, so the results are final
  promotedAt: Date | null;
  options: PromotionOption[]; // open classes in later terms
  defaults: { pass: string | null; fail: string | null };
  students: PromotionStudent[];
};
export type Move = { enrolmentId: string; toClassId: string | null };

async function source(classId: string) {
  const [c] = await db
    .select({ k: klass, courseName: course.name, nextCourseId: course.nextCourseId, t: term })
    .from(klass)
    .innerJoin(course, eq(course.id, klass.courseId))
    .innerJoin(term, eq(term.id, klass.termId))
    .where(eq(klass.id, classId))
    .limit(1);
  if (!c) throw new ValidationError('That class no longer exists.');
  return c;
}

// Classes students can move to: still active, in a term that starts later and isn't closed.
async function laterClasses(termStart: string) {
  const rows = await db
    .select({
      id: klass.id,
      name: klass.name,
      courseId: klass.courseId,
      courseName: course.name,
      termId: term.id,
      termName: term.name,
      termStart: term.startDate,
      day: klass.day,
      startTime: klass.startTime,
      minutes: klass.minutes,
      weeks: klass.weeks,
      firstDate: klass.firstDate,
    })
    .from(klass)
    .innerJoin(course, eq(course.id, klass.courseId))
    .innerJoin(term, eq(term.id, klass.termId))
    .where(and(eq(klass.status, 'active'), ne(term.status, 'closed'), gt(term.startDate, termStart)))
    .orderBy(asc(term.startDate), asc(klass.name));
  const leads = rows.length
    ? await db
        .select({ classId: classTeacher.classId, name: user.name })
        .from(classTeacher)
        .innerJoin(user, eq(user.id, classTeacher.userId))
        .where(
          and(
            inArray(
              classTeacher.classId,
              rows.map((r) => r.id),
            ),
            eq(classTeacher.role, 'lead'),
          ),
        )
    : [];
  const leadOf = new Map(leads.map((l) => [l.classId, l.name]));
  return rows.map((r) => ({ ...r, teacher: leadOf.get(r.id) ?? null }));
}

async function activeEnrolments(classId: string) {
  return db
    .select({ id: enrolment.id, studentId: enrolment.studentId })
    .from(enrolment)
    .where(and(eq(enrolment.classId, classId), eq(enrolment.status, 'active')));
}

export type PromotionListRow = {
  id: string;
  name: string;
  termName: string;
  students: number;
  published: number; // term reports published, of `students`
  promotedAt: Date | null;
};

// The Promotion page: the classes of the two latest terms that have started, newest term first.
export async function promotionList(actor: Actor | null, opts: Opts = {}): Promise<PromotionListRow[]> {
  assertCan(actor, 'classes.manage');
  const terms = await latestStartedTerms(todayIn((await getClubSettings()).timeZone, opts.now));
  if (!terms.length) return [];
  return db
    .select({
      id: klass.id,
      name: klass.name,
      termName: term.name,
      students: sql<number>`(select count(*)::int from ${enrolment} e where e.class_id = ${klass.id} and e.status in ('active', 'completed'))`,
      published: sql<number>`(select count(*)::int from ${enrolment} e join ${studentReport} r on r.enrolment_id = e.id
        where e.class_id = ${klass.id} and e.status in ('active', 'completed') and r.published_at is not null)`,
      promotedAt: klass.promotedAt,
    })
    .from(klass)
    .innerJoin(term, eq(term.id, klass.termId))
    .where(inArray(klass.termId, terms))
    .orderBy(desc(term.startDate), asc(klass.name));
}

export async function promotionPlan(actor: Actor | null, classId: string, opts: Opts = {}): Promise<PromotionPlan> {
  assertCan(actor, 'classes.manage');
  const c = await source(classId);
  const [later, active, { rows }] = await Promise.all([
    laterClasses(c.t.startDate),
    activeEnrolments(classId),
    loadTermReports(classId, opts),
  ]);
  // The term right after this one is where the defaults come from.
  const next = later[0]?.termId;
  const pick = (courseId: string | null) => later.find((o) => o.termId === next && o.courseId === courseId)?.id ?? null;
  const defaults = { pass: pick(c.nextCourseId), fail: pick(c.k.courseId) };
  const stillIn = new Set(active.map((e) => e.id));
  const students = rows
    .filter((r) => stillIn.has(r.enrolmentId))
    .map((r) => ({
      enrolmentId: r.enrolmentId,
      studentId: r.studentId,
      name: r.name,
      score: r.score,
      result: r.status === 'published' ? r.result : null,
      target: r.status !== 'published' ? null : r.result === 'pass' ? defaults.pass : defaults.fail,
    }));
  return {
    classId,
    className: c.k.name,
    courseName: c.courseName,
    termName: c.t.name,
    published: students.length > 0 && students.every((s) => s.result !== null),
    promotedAt: c.k.promotedAt,
    options: later.map((o) => ({
      id: o.id,
      name: o.name,
      courseName: o.courseName,
      termName: o.termName,
      schedule: scheduleLabel({ day: o.day as Day, startTime: o.startTime, minutes: o.minutes, weeks: o.weeks }),
      teacher: o.teacher,
    })),
    defaults,
    students,
  };
}

export async function promote(actor: Actor | null, classId: string, moves: Move[], opts: Opts = {}) {
  assertCan(actor, 'classes.manage');
  const plan = await promotionPlan(actor, classId, opts);
  if (plan.promotedAt) throw new ValidationError('This class has already been promoted.');
  if (!plan.published) throw new ValidationError('Publish the term reports first: promotion uses their results.');
  const chosen = new Map(moves.map((m) => [m.enrolmentId, m.toClassId]));
  for (const s of plan.students) if (!chosen.has(s.enrolmentId)) throw new ValidationError(`Choose where ${s.name} goes next.`);
  if (chosen.size !== moves.length || chosen.size !== plan.students.length)
    throw new ValidationError('The class list has changed since you opened this page. Reload it and try again.');

  const c = await source(classId);
  const targets = new Map((await laterClasses(c.t.startDate)).map((o) => [o.id, o]));
  const targetIds = [...new Set([...chosen.values()].filter((id): id is string => id !== null))];
  for (const id of targetIds) {
    if (targets.has(id)) continue;
    const [k] = await db.select({ name: klass.name }).from(klass).where(eq(klass.id, id)).limit(1);
    throw new ValidationError(`${k?.name ?? 'That class'} is not a class in a later term that is still open.`);
  }
  if (targetIds.length) {
    const [already] = await db
      .select({ name: user.name, className: klass.name })
      .from(enrolment)
      .innerJoin(user, eq(user.id, enrolment.studentId))
      .innerJoin(klass, eq(klass.id, enrolment.classId))
      .where(
        and(
          inArray(enrolment.classId, targetIds),
          inArray(
            enrolment.studentId,
            plan.students.map((s) => s.studentId),
          ),
          eq(enrolment.status, 'active'),
        ),
      )
      .limit(1);
    if (already) throw new ValidationError(`${already.name} is already in ${already.className}.`);
  }

  const today = todayIn((await getClubSettings()).timeZone, opts.now);
  const log = plan.students.map((s) => ({ studentId: s.studentId, result: s.result, to: chosen.get(s.enrolmentId) ?? null }));
  const moved = log.filter((m) => m.to !== null).length;
  await db.transaction(async (tx) => {
    // Two admins confirming at once: only the first promotes.
    const [locked] = await tx.select({ promotedAt: klass.promotedAt }).from(klass).where(eq(klass.id, classId)).for('update');
    if (locked?.promotedAt) throw new ValidationError('This class has already been promoted.');
    for (const s of plan.students) {
      const ended = await tx
        .update(enrolment)
        .set({ status: 'completed', endedOn: c.t.endDate })
        .where(and(eq(enrolment.id, s.enrolmentId), eq(enrolment.status, 'active')))
        .returning({ id: enrolment.id });
      if (!ended.length) throw new ValidationError('The class list has changed since you opened this page. Reload it and try again.');
      const to = chosen.get(s.enrolmentId);
      if (!to) continue;
      const firstDate = targets.get(to)!.firstDate;
      await tx.insert(enrolment).values({
        id: crypto.randomUUID(),
        classId: to,
        studentId: s.studentId,
        enrolledOn: firstDate > today ? firstDate : today,
        promotedFromId: s.enrolmentId,
      });
    }
    await tx
      .update(klass)
      .set({ status: 'archived', promotedAt: opts.now ?? new Date() })
      .where(eq(klass.id, classId));
    await audit(
      {
        actorId: actor.userId,
        action: 'class.promote',
        entity: 'class',
        entityId: classId,
        detail: { moved, left: log.length - moved, moves: log },
      },
      tx,
    );
  });
  return { moved, left: log.length - moved };
}
