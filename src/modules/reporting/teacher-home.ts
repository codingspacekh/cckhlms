// A teacher's "Today" (FR-TCH-21, M8): their next class first, what to know before it (who was away last time,
// the latest homework handed in, questions waiting), hand-ins to mark, and this weekend's classes.
import { and, desc, eq, inArray, isNull, ne, notExists, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db/client';
import { assessment, attendance, classTeacher, enrolment, lesson, question, reply, submission, user } from '@/db/schema';
import { myClasses, type MyClass } from '@/modules/academics/enrolments';
import { todayIn } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { assertCan } from '@/server/errors';
import { weekendOf } from './dashboard-rules';

type Opts = { now?: Date };

export type TeacherFocus = {
  classId: string;
  className: string;
  room: string | null;
  students: number;
  minutes: number;
  session: { date: string; startTime: string; week: number | null };
  lesson: { title: string; published: boolean } | null;
  // The session before it: who was away, or null when its attendance wasn't taken.
  lastTime: { week: number | null; away: string[] | null } | null;
  homework: { id: string; title: string; handedIn: number; of: number } | null;
  questions: { count: number; askers: string[]; href: string | null };
};
export type ToMark = {
  classId: string;
  className: string;
  workId: string;
  title: string;
  studentId: string;
  name: string;
  submittedAt: Date;
};
export type WeekendSession = {
  classId: string;
  className: string;
  date: string;
  startTime: string;
  room: string | null;
  week: number | null;
};

const TO_MARK_LIMIT = 8;

export async function teacherHome(actor: Actor | null, opts: Opts = {}) {
  assertCan(actor, 'teacher.area');
  const now = opts.now ?? new Date();
  const [{ timeZone }, all] = await Promise.all([getClubSettings(), myClasses(actor, { now })]);
  const today = todayIn(timeZone, now);
  // myClasses also lists classes a teacher is enrolled in as a student; only the ones they teach count here.
  const taught = new Set(
    (await db.select({ id: classTeacher.classId }).from(classTeacher).where(eq(classTeacher.userId, actor.userId))).map((r) => r.id),
  );
  const classes = all.filter((c) => taught.has(c.id));
  const sessionsOf = new Map(await Promise.all(classes.map(async (c) => [c.id, await weeksOf(c.id)] as const)));

  const next = classes.find((c) => c.nextSession) ?? null;
  const focus = next ? await focusOn(next, sessionsOf.get(next.id)!) : null;

  const [sat, sun] = weekendOf(today);
  const weekend: WeekendSession[] = classes
    .flatMap((c) =>
      sessionsOf
        .get(c.id)!
        .filter((s) => !s.cancelled && (s.date === sat || s.date === sun))
        .map((s) => ({ classId: c.id, className: c.name, date: s.date, startTime: s.startTime, room: c.room, week: s.week })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  return { today, classes, focus, toMark: await handInsToMark(classes), weekend };
}

async function focusOn(c: MyClass, sessions: Awaited<ReturnType<typeof weeksOf>>): Promise<TeacherFocus> {
  const s = sessions.find((x) => !x.cancelled && x.date === c.nextSession!.date)!;
  const before = sessions.filter((x) => !x.cancelled && x.date < s.date);
  const prev = before.at(-1) ?? null;

  const [lessonRow] = await db.select({ title: lesson.title, status: lesson.status }).from(lesson).where(eq(lesson.sessionId, s.id));

  let lastTime: TeacherFocus['lastTime'] = null;
  if (prev) {
    const marks = await db
      .select({ name: user.name, status: attendance.status })
      .from(attendance)
      .innerJoin(enrolment, eq(enrolment.id, attendance.enrolmentId))
      .innerJoin(user, eq(user.id, enrolment.studentId))
      .where(eq(attendance.sessionId, prev.id))
      .orderBy(user.name);
    lastTime = { week: prev.week, away: marks.length ? marks.filter((m) => m.status === 'absent').map((m) => m.name) : null };
  }

  // The latest homework set before this session, and how many of the class have handed it in.
  const dateOf = new Map(before.map((x) => [x.id, x.date]));
  const set = before.length
    ? await db
        .select({ id: assessment.id, title: assessment.title, sessionId: assessment.sessionId, createdAt: assessment.createdAt })
        .from(assessment)
        .where(
          and(
            inArray(assessment.sessionId, [...dateOf.keys()]),
            eq(assessment.kind, 'homework'),
            eq(assessment.status, 'published'),
            ne(assessment.language, 'paper'),
          ),
        )
    : [];
  const hw = set.sort(
    (a, b) => dateOf.get(b.sessionId)!.localeCompare(dateOf.get(a.sessionId)!) || b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
  let homework: TeacherFocus['homework'] = null;
  if (hw) {
    const [row] = await db
      .select({ n: sql<number>`count(distinct ${submission.studentId})::int` })
      .from(submission)
      .innerJoin(enrolment, and(eq(enrolment.studentId, submission.studentId), eq(enrolment.classId, c.id), eq(enrolment.status, 'active')))
      .where(and(eq(submission.assessmentId, hw.id), eq(submission.byTeacher, false)));
    homework = { id: hw.id, title: hw.title, handedIn: row?.n ?? 0, of: c.students };
  }

  // Questions on this class's lessons that no teacher of the class has answered yet.
  const asker = alias(user, 'asker');
  const teacherReply = db
    .select({ one: sql`1` })
    .from(reply)
    .innerJoin(classTeacher, and(eq(classTeacher.userId, reply.authorId), eq(classTeacher.classId, c.id)))
    .where(eq(reply.questionId, question.id));
  const waiting = await db
    .select({ name: asker.name, sessionId: lesson.sessionId, at: question.createdAt })
    .from(question)
    .innerJoin(lesson, eq(lesson.id, question.lessonId))
    .innerJoin(asker, eq(asker.id, question.authorId))
    .where(
      and(
        inArray(
          lesson.sessionId,
          sessions.map((x) => x.id),
        ),
        eq(question.visibility, 'visible'),
        isNull(question.acceptedReplyId),
        notExists(teacherReply),
      ),
    )
    .orderBy(desc(question.createdAt));
  const latestWeek = waiting[0] ? sessions.find((x) => x.id === waiting[0]!.sessionId)?.week : null;

  return {
    classId: c.id,
    className: c.name,
    room: c.room,
    students: c.students,
    minutes: c.minutes,
    session: { date: s.date, startTime: s.startTime, week: s.week },
    lesson: lessonRow ? { title: lessonRow.title, published: lessonRow.status === 'published' } : null,
    lastTime,
    homework,
    questions: {
      count: waiting.length,
      askers: [...new Set(waiting.map((w) => w.name))],
      href: latestWeek ? `/teacher/classes/${c.id}/weeks/${latestWeek}/questions` : null,
    },
  };
}

// Hand-ins waiting for a mark across the teacher's classes: the latest version of each student still in the
// class, newest first.
async function handInsToMark(classes: MyClass[]): Promise<ToMark[]> {
  if (!classes.length) return [];
  const nameOf = new Map(classes.map((c) => [c.id, c.name]));
  const latest = db
    .selectDistinctOn([submission.assessmentId, submission.studentId], {
      assessmentId: submission.assessmentId,
      studentId: submission.studentId,
      score: submission.score,
      returnedAt: submission.returnedAt,
      byTeacher: submission.byTeacher,
      submittedAt: submission.submittedAt,
    })
    .from(submission)
    .innerJoin(assessment, eq(assessment.id, submission.assessmentId))
    .where(
      inArray(
        assessment.classId,
        classes.map((c) => c.id),
      ),
    )
    .orderBy(submission.assessmentId, submission.studentId, desc(submission.version))
    .as('latest');
  const rows = await db
    .select({
      classId: assessment.classId,
      workId: assessment.id,
      title: assessment.title,
      studentId: latest.studentId,
      name: user.name,
      submittedAt: latest.submittedAt,
    })
    .from(latest)
    .innerJoin(assessment, eq(assessment.id, latest.assessmentId))
    .innerJoin(user, eq(user.id, latest.studentId))
    .innerJoin(
      enrolment,
      and(eq(enrolment.classId, assessment.classId), eq(enrolment.studentId, latest.studentId), eq(enrolment.status, 'active')),
    )
    .where(and(isNull(latest.score), isNull(latest.returnedAt), eq(latest.byTeacher, false)))
    .orderBy(desc(latest.submittedAt))
    .limit(TO_MARK_LIMIT);
  return rows.map((r) => ({ ...r, className: nameOf.get(r.classId) ?? '' }));
}

export type TeacherHome = Awaited<ReturnType<typeof teacherHome>>;
