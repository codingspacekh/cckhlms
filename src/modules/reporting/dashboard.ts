// The admin dashboard (FR-ADM-10): the classes running now (active, in a term that isn't closed), with headline
// tiles, standings across classes, this weekend's sessions, a classes table, and what needs attention: students
// flagged as needing support, weekly reports not written for held sessions, and low attendance.
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { classTeacher, klass, studentReport, term, user } from '@/db/schema';
import { addMinutes, todayIn } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import { reportedSessions } from '@/modules/teaching/reports';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { assertCan } from '@/server/errors';
import { isLowAttendance, weekendOf } from './dashboard-rules';
import { loadStandings, type ClassStandings } from './standing';
import { mean, scoreBands } from './statistics-rules';

type Opts = { now?: Date };

// Classes running now, with their lead teacher.
export async function runningClasses() {
  const rows = await db
    .select({ id: klass.id, name: klass.name, room: klass.room })
    .from(klass)
    .innerJoin(term, eq(term.id, klass.termId))
    .where(and(eq(klass.status, 'active'), ne(term.status, 'closed')))
    .orderBy(asc(klass.name));
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
  return rows.map((r) => ({ ...r, teacher: leads.find((l) => l.classId === r.id)?.name ?? '' }));
}

// Present + late over everyone expected, pooled across students (BR-09).
const pooledAttendance = (students: ClassStandings['students']) => {
  const came = students.reduce((n, s) => n + s.attendance.present + s.attendance.late, 0);
  const expected = students.reduce((n, s) => n + s.attendance.held - s.attendance.excused, 0);
  return expected ? Math.round((came / expected) * 100) : null;
};

export async function adminDashboard(actor: Actor | null, opts: Opts = {}) {
  assertCan(actor, 'admin.area');
  const now = opts.now ?? new Date();
  const today = todayIn((await getClubSettings()).timeZone, now);
  const weekend = weekendOf(today);
  const classes = await runningClasses();
  const loaded = await Promise.all(
    classes.map(async (c) => {
      const [standings, sessions] = await Promise.all([loadStandings(c.id, { now }), weeksOf(c.id)]);
      return { c, standings, sessions };
    }),
  );
  const ids = loaded.flatMap((l) => l.standings.students.map((s) => s.enrolmentId));
  const flagged = ids.length
    ? await db
        .select({ enrolmentId: studentReport.enrolmentId, note: studentReport.supportNote })
        .from(studentReport)
        .where(and(inArray(studentReport.enrolmentId, ids), eq(studentReport.needsSupport, true)))
    : [];
  const held = loaded.flatMap((l) => l.sessions.filter((s) => !s.cancelled && s.date < today).map((s) => ({ l, s })));
  const reported = await reportedSessions(held.map((h) => h.s.id));

  const students = loaded.flatMap((l) => l.standings.students.map((s) => ({ ...s, className: l.c.name })));
  const support = students.flatMap((s) => {
    const f = flagged.find((x) => x.enrolmentId === s.enrolmentId);
    return f ? [{ studentId: s.studentId, name: s.name, className: s.className, note: f.note }] : [];
  });
  return {
    today,
    tiles: {
      activeClasses: classes.length,
      students: new Set(students.map((s) => s.studentId)).size,
      classPlaces: students.length,
      attendance: pooledAttendance(students),
      needSupport: new Set(support.map((s) => s.studentId)).size,
    },
    bands: scoreBands(students.map((s) => s.overall.overall)),
    weekend: loaded
      .flatMap(({ c, sessions }) =>
        sessions
          .filter((s) => !s.cancelled && (s.date === weekend[0] || s.date === weekend[1]))
          .map((s) => ({
            classId: c.id,
            className: c.name,
            date: s.date,
            startTime: s.startTime,
            endTime: addMinutes(s.startTime, s.minutes),
            room: c.room,
            week: s.week,
          })),
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    classes: loaded.map(({ c, standings }) => ({
      classId: c.id,
      className: c.name,
      teacher: c.teacher,
      students: standings.students.length,
      passMark: standings.passMark,
      attendance: pooledAttendance(standings.students),
      average: mean(standings.students.map((s) => s.overall.overall)),
    })),
    attention: {
      support,
      missingReports: held
        .filter((h) => !reported.has(h.s.id))
        .map(({ l, s }) => ({ classId: l.c.id, className: l.c.name, week: s.week, date: s.date, teacher: l.c.teacher })),
      lowAttendance: students
        .filter((s) => isLowAttendance(s.attendance))
        .map((s) => ({ studentId: s.studentId, name: s.name, className: s.className, percent: s.attendance.percent })),
    },
  };
}
export type AdminDashboard = Awaited<ReturnType<typeof adminDashboard>>;
