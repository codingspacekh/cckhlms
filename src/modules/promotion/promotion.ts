// Term-end promotion (FR-ADM-13, BR-07): the wizard moves a class's students on. Passed students go to the
// next-level class, the others to a repeat class (or leave the club). Everything happens in one transaction:
// new enrolments, the old ones marked completed, the old class archived, one audit row. Nothing is deleted.
// Until the new classes start, and while nothing is recorded there, a promotion can be undone (M15b, BR-30).
import { and, asc, desc, eq, gt, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '@/db/client';
import {
  assessment,
  attendance,
  certificate,
  classReportStudent,
  classSession,
  classTeacher,
  course,
  enrolment,
  excusal,
  klass,
  lesson,
  question,
  reply,
  studentReport,
  submission,
  supportLineStudent,
  term,
  user,
  workDraft,
} from '@/db/schema';
import { formatDate, scheduleLabel, todayIn, zonedToUtc, type Day } from '@/modules/academics/schedule';
import { latestStartedTerms } from '@/modules/academics/terms';
import { getClubSettings } from '@/modules/club/service';
import { loadTermReports } from '@/modules/reporting/term-reports';
import type { Result } from '@/modules/reporting/rules';
import type { Actor } from '@/server/actor';
import type { Slot } from './rules';
import { audit, type Executor } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';

type Opts = { now?: Date };

export type PromotionOption = {
  id: string;
  name: string;
  courseName: string;
  termId: string;
  termName: string;
  schedule: string;
  teacher: string | null;
  // For the places and clash warnings (M15a, BR-30).
  day: Day;
  startTime: string;
  minutes: number;
  capacity: number | null;
  enrolled: number; // active students already in it
};
export type PromotionStudent = {
  enrolmentId: string;
  studentId: string;
  name: string;
  score: number | null;
  result: Result | null;
  target: string | null; // the class pre-selected for them; null = leaves the club
  busy: Slot[]; // the later classes they are already in, for the clash warning (M15a)
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
      capacity: klass.capacity,
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

// Who is already in each of those classes: the places count and each student's clashes (M15a).
async function enrolledIn(classIds: string[]) {
  if (!classIds.length) return [];
  return db
    .select({ classId: enrolment.classId, studentId: enrolment.studentId })
    .from(enrolment)
    .where(and(inArray(enrolment.classId, classIds), eq(enrolment.status, 'active')));
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
  undoUntil: string | null; // the day its promotion can be undone until (M15b); null when it can't be
};

// The Promotion page: the classes of the two latest terms that have started, newest term first.
export async function promotionList(actor: Actor | null, opts: Opts = {}): Promise<PromotionListRow[]> {
  assertCan(actor, 'classes.manage');
  const { timeZone } = await getClubSettings();
  const terms = await latestStartedTerms(todayIn(timeZone, opts.now));
  if (!terms.length) return [];
  const rows = await db
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
  return Promise.all(
    rows.map(async (r) => {
      if (!r.promotedAt) return { ...r, undoUntil: null };
      const u = await undoCheck(db, r.id, timeZone, opts.now ?? new Date());
      return { ...r, undoUntil: u.state.can ? (u.state.until?.date ?? null) : null };
    }),
  );
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
  const taken = await enrolledIn(later.map((o) => o.id));
  const next = later[0]?.termId;
  const pick = (courseId: string | null) => later.find((o) => o.termId === next && o.courseId === courseId)?.id ?? null;
  const defaults = { pass: pick(c.nextCourseId), fail: pick(c.k.courseId) };
  const stillIn = new Set(active.map((e) => e.id));
  const slotOf = new Map(
    later.map((o) => [
      o.id,
      { classId: o.id, termId: o.termId, name: o.name, day: o.day as Day, startTime: o.startTime, minutes: o.minutes },
    ]),
  );
  const students = rows
    .filter((r) => stillIn.has(r.enrolmentId))
    .map((r) => ({
      enrolmentId: r.enrolmentId,
      studentId: r.studentId,
      name: r.name,
      score: r.score,
      result: r.status === 'published' ? r.result : null,
      target: r.status !== 'published' ? null : r.result === 'pass' ? defaults.pass : defaults.fail,
      busy: taken.filter((t) => t.studentId === r.studentId).map((t) => slotOf.get(t.classId)!),
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
      termId: o.termId,
      termName: o.termName,
      schedule: scheduleLabel({ day: o.day as Day, startTime: o.startTime, minutes: o.minutes, weeks: o.weeks }),
      teacher: o.teacher,
      day: o.day as Day,
      startTime: o.startTime,
      minutes: o.minutes,
      capacity: o.capacity,
      enrolled: taken.filter((t) => t.classId === o.id).length,
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

export type UndoState =
  | {
      can: true;
      until: { date: string; startTime: string; className: string } | null; // the earliest new class's first session
      back: number; // students back in the class
      removed: { className: string; count: number }[]; // the enrolments the promotion made, by class
      leaving: string[]; // students who were leaving the club
    }
  | { can: false; reason: string };

const noUndo = (why: string): UndoState => ({
  can: false,
  reason: `Undo isn’t possible any more: ${why}. Move a student with Transfer on the class page instead.`,
});

// Which of the promotion's new enrolments have anything recorded in their class: attendance, a weekly report row,
// a support line, a term report or certificate, work handed in, a draft, an excusal, or a Q&A post (BR-30).
async function recordedIn(q: Executor, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const theirs = (studentId: AnyPgColumn, classId: AnyPgColumn) =>
    and(inArray(enrolment.id, ids), eq(enrolment.studentId, studentId), eq(enrolment.classId, classId));
  const found = await Promise.all([
    q.select({ id: attendance.enrolmentId }).from(attendance).where(inArray(attendance.enrolmentId, ids)),
    q.select({ id: classReportStudent.enrolmentId }).from(classReportStudent).where(inArray(classReportStudent.enrolmentId, ids)),
    q.select({ id: supportLineStudent.enrolmentId }).from(supportLineStudent).where(inArray(supportLineStudent.enrolmentId, ids)),
    q.select({ id: studentReport.enrolmentId }).from(studentReport).where(inArray(studentReport.enrolmentId, ids)),
    q.select({ id: certificate.enrolmentId }).from(certificate).where(inArray(certificate.enrolmentId, ids)),
    ...[submission, workDraft, excusal].map((t) =>
      q
        .select({ id: enrolment.id })
        .from(t)
        .innerJoin(assessment, eq(assessment.id, t.assessmentId))
        .innerJoin(enrolment, theirs(t.studentId, assessment.classId)),
    ),
    q
      .select({ id: enrolment.id })
      .from(question)
      .innerJoin(lesson, eq(lesson.id, question.lessonId))
      .innerJoin(classSession, eq(classSession.id, lesson.sessionId))
      .innerJoin(enrolment, theirs(question.authorId, classSession.classId)),
    q
      .select({ id: enrolment.id })
      .from(reply)
      .innerJoin(question, eq(question.id, reply.questionId))
      .innerJoin(lesson, eq(lesson.id, question.lessonId))
      .innerJoin(classSession, eq(classSession.id, lesson.sessionId))
      .innerJoin(enrolment, theirs(reply.authorId, classSession.classId)),
  ]);
  return new Set(found.flat().map((r) => r.id));
}

// Whether a promotion can still be undone, and what undoing it would do.
async function undoCheck(q: Executor, classId: string, timeZone: string, now: Date) {
  const [c] = await q
    .select({ promotedAt: klass.promotedAt, termName: term.name, termStatus: term.status })
    .from(klass)
    .innerJoin(term, eq(term.id, klass.termId))
    .where(eq(klass.id, classId))
    .limit(1);
  if (!c) throw new ValidationError('That class no longer exists.');
  if (!c.promotedAt) throw new ValidationError('This class hasn’t been promoted.');
  // Only a promotion marks an enrolment completed.
  const old = await q
    .select({ id: enrolment.id, studentId: enrolment.studentId, name: user.name })
    .from(enrolment)
    .innerJoin(user, eq(user.id, enrolment.studentId))
    .where(and(eq(enrolment.classId, classId), eq(enrolment.status, 'completed')));
  const made = old.length
    ? await q
        .select({ id: enrolment.id, status: enrolment.status, classId: enrolment.classId, className: klass.name, name: user.name })
        .from(enrolment)
        .innerJoin(klass, eq(klass.id, enrolment.classId))
        .innerJoin(user, eq(user.id, enrolment.studentId))
        .where(
          and(
            isNotNull(enrolment.promotedFromId),
            inArray(
              enrolment.promotedFromId,
              old.map((o) => o.id),
            ),
          ),
        )
        .orderBy(asc(user.name))
    : [];
  const done = (state: UndoState) => ({
    state,
    oldIds: old.map((o) => o.id),
    madeIds: made.map((m) => m.id),
    studentIds: old.map((o) => o.studentId),
  });

  let until: Extract<UndoState, { can: true }>['until'] = null;
  if (made.length) {
    const [first] = await q
      .select({ date: classSession.date, startTime: classSession.startTime, className: klass.name })
      .from(classSession)
      .innerJoin(klass, eq(klass.id, classSession.classId))
      .where(
        and(
          inArray(
            classSession.classId,
            made.map((m) => m.classId),
          ),
          eq(classSession.status, 'scheduled'),
        ),
      )
      .orderBy(asc(classSession.date), asc(classSession.startTime), asc(klass.name))
      .limit(1);
    if (first) {
      if (zonedToUtc(first.date, first.startTime, timeZone).getTime() <= now.getTime())
        return done(noUndo(`${first.className} started on ${formatDate(first.date)}`));
      until = first;
    }
  } else if (c.termStatus === 'closed') return done(noUndo(`${c.termName} is closed`));

  const gone = made.find((m) => m.status !== 'active');
  if (gone) return done(noUndo(`${gone.name} is no longer in ${gone.className}`));
  const recorded = await recordedIn(
    q,
    made.map((m) => m.id),
  );
  const busy = made.find((m) => recorded.has(m.id));
  if (busy) return done(noUndo(`something has been recorded for ${busy.name} in ${busy.className}`));

  const counts = new Map<string, number>();
  for (const m of made) counts.set(m.className, (counts.get(m.className) ?? 0) + 1);
  const movedOn = new Set(made.map((m) => m.name));
  return done({
    can: true,
    until,
    back: old.length,
    removed: [...counts].map(([className, count]) => ({ className, count })).sort((a, b) => a.className.localeCompare(b.className)),
    leaving: old
      .filter((o) => !movedOn.has(o.name))
      .map((o) => o.name)
      .sort(),
  });
}

export async function promotionUndo(actor: Actor | null, classId: string, opts: Opts = {}): Promise<UndoState> {
  assertCan(actor, 'promotion.undo');
  const { timeZone } = await getClubSettings();
  return (await undoCheck(db, classId, timeZone, opts.now ?? new Date())).state;
}

// M15b (BR-30): everyone back in the class, the enrolments the promotion made removed, the class open again (or
// still archived, when its term has been closed) and ready to be promoted again. Results are not touched.
export async function undoPromotion(actor: Actor | null, classId: string, opts: Opts = {}) {
  assertCan(actor, 'promotion.undo');
  const { timeZone } = await getClubSettings();
  return db.transaction(async (tx) => {
    // Two admins undoing at once: the second finds the class no longer promoted.
    await tx.select({ id: klass.id }).from(klass).where(eq(klass.id, classId)).for('update');
    const { state, oldIds, madeIds, studentIds } = await undoCheck(tx, classId, timeZone, opts.now ?? new Date());
    if (!state.can) throw new ValidationError(state.reason);
    if (madeIds.length) await tx.delete(enrolment).where(inArray(enrolment.id, madeIds));
    if (oldIds.length) await tx.update(enrolment).set({ status: 'active', endedOn: null }).where(inArray(enrolment.id, oldIds));
    const [t] = await tx
      .select({ status: term.status })
      .from(klass)
      .innerJoin(term, eq(term.id, klass.termId))
      .where(eq(klass.id, classId));
    await tx
      .update(klass)
      .set({ promotedAt: null, status: t?.status === 'closed' ? 'archived' : 'active' })
      .where(eq(klass.id, classId));
    await audit(
      {
        actorId: actor.userId,
        action: 'class.promote_undo',
        entity: 'class',
        entityId: classId,
        detail: { back: oldIds.length, removed: madeIds.length, students: [...studentIds].sort() },
      },
      tx,
    );
    return { back: oldIds.length };
  });
}
