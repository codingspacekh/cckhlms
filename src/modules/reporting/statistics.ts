// A class's statistics for its teachers and Admin (FR-TCH-18): headline tiles, attendance and the score trend by
// week, the average by task, how standings spread, and topics to revisit. Everything starts from the students'
// standings (standing.ts) and the attendance rows, so the charts agree with the gradebook.
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { attendance, classReport, classReportTopic, enrolment, lesson, lessonTopic, syllabusTopic } from '@/db/schema';
import { classAccess, enrolledOrCompleted } from '@/modules/academics/access';
import type { Kind } from '@/modules/assessments/rules';
import type { AttendanceStatus } from '@/modules/attendance/rules';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { assertCan } from '@/server/errors';
import { loadStandings } from './standing';
import { attendanceByWeek, mean, scoreBands, taskAverages, topicAverages, trendByWeek } from './statistics-rules';

type Opts = { now?: Date };

// The syllabus topics of each session: its lesson's topics and its weekly report's.
async function topicsBySession(sessionIds: string[]) {
  if (!sessionIds.length) return new Map<string, string[]>();
  const [fromLessons, fromReports] = await Promise.all([
    db
      .select({ sessionId: lesson.sessionId, title: syllabusTopic.title })
      .from(lesson)
      .innerJoin(lessonTopic, eq(lessonTopic.lessonId, lesson.id))
      .innerJoin(syllabusTopic, eq(syllabusTopic.id, lessonTopic.topicId))
      .where(inArray(lesson.sessionId, sessionIds)),
    db
      .select({ sessionId: classReport.sessionId, title: syllabusTopic.title })
      .from(classReport)
      .innerJoin(classReportTopic, eq(classReportTopic.reportId, classReport.id))
      .innerJoin(syllabusTopic, eq(syllabusTopic.id, classReportTopic.topicId))
      .where(inArray(classReport.sessionId, sessionIds)),
  ]);
  const out = new Map<string, string[]>();
  for (const r of [...fromLessons, ...fromReports]) {
    const list = out.get(r.sessionId) ?? [];
    if (!list.includes(r.title)) list.push(r.title);
    out.set(r.sessionId, list);
  }
  return out;
}

export async function classStatistics(actor: Actor | null, classId: string, opts: Opts = {}) {
  assertCan(actor, 'class.view', await classAccess(classId));
  const [standings, sessions] = await Promise.all([loadStandings(classId, opts), weeksOf(classId)]);
  const held = sessions.filter((s) => !s.cancelled);
  const [marks, topics] = await Promise.all([
    held.length
      ? db
          .select({ sessionId: attendance.sessionId, status: attendance.status })
          .from(attendance)
          .innerJoin(enrolment, eq(enrolment.id, attendance.enrolmentId))
          .where(
            and(
              inArray(
                attendance.sessionId,
                held.map((s) => s.id),
              ),
              enrolledOrCompleted,
            ),
          )
      : [],
    topicsBySession(held.map((s) => s.id)),
  ]);
  // Work is set in a week's session; its topics are that session's.
  const sessionOfWeek = new Map(held.map((s) => [s.week, s.id]));
  const students = standings.students;
  const scores = students.map((s) => s.overall.overall);
  const counted = scores.filter((s): s is number => s !== null);
  const byWeek = held
    .filter((s) => s.week !== null)
    .map((s) => ({
      week: s.week!,
      date: s.date,
      statuses: marks.filter((m) => m.sessionId === s.id).map((m) => m.status as AttendanceStatus),
    }));
  const dateOf = new Map(byWeek.map((w) => [w.week, w.date]));
  const kindOf = new Map(standings.work.map((w) => [w.id, w.kind]));
  return {
    className: standings.className,
    passMark: standings.passMark,
    tiles: {
      average: mean(scores),
      belowPass: counted.filter((s) => s < standings.passMark).length,
      withScore: counted.length,
      students: students.length,
      homework: (() => {
        const m = mean(students.map((s) => s.homework.percent));
        return m === null ? null : Math.round(m);
      })(),
      passMark: standings.passMark,
    },
    attendance: attendanceByWeek(byWeek).map((a) => ({ week: a.week, date: dateOf.get(a.week)!, percent: a.percent })),
    trend: trendByWeek(standings.work, students),
    tasks: taskAverages(standings.work, students).map((t) => ({ ...t, kind: kindOf.get(t.id) as Kind })),
    bands: scoreBands(scores),
    topics: topicAverages(
      standings.work.map((w) => ({ taskId: w.id, topics: topics.get(sessionOfWeek.get(w.week) ?? '') ?? [] })),
      students,
    ),
  };
}
export type ClassStatistics = Awaited<ReturnType<typeof classStatistics>>;
