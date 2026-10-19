// A class's weeks (BR-15): each session with its week number, worked out from the dates.
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { classSession, course, klass } from '@/db/schema';
import { classAccess } from '@/modules/academics/access';
import { numberWeeks } from '@/modules/academics/schedule';
import type { Actor } from '@/server/actor';
import { assertCan, ValidationError } from '@/server/errors';

// Sessions of a class in date order, each with its week number (null when cancelled).
export async function weeksOf(classId: string) {
  const rows = await db.select().from(classSession).where(eq(classSession.classId, classId)).orderBy(asc(classSession.date));
  const weeks = numberWeeks(rows.map((s) => ({ id: s.id, date: s.date, cancelled: s.status === 'cancelled' })));
  return rows.map((s) => ({ ...s, week: weeks.get(s.id) ?? null, cancelled: s.status === 'cancelled' }));
}

export type WeekContext = {
  classId: string;
  className: string;
  courseName: string;
  sessionId: string;
  week: number;
  date: string;
  startTime: string;
  minutes: number;
  weeks: number[];
};

// The header of a teacher's week page: which class, which week, and the weeks either side.
export async function teacherWeek(actor: Actor | null, classId: string, week: number): Promise<WeekContext> {
  assertCan(actor, 'class.view', await classAccess(classId));
  const [c] = await db
    .select({ name: klass.name, courseName: course.name })
    .from(klass)
    .innerJoin(course, eq(course.id, klass.courseId))
    .where(eq(klass.id, classId))
    .limit(1);
  if (!c) throw new ValidationError('That class no longer exists.');
  const all = await weeksOf(classId);
  const s = all.find((r) => r.week === week);
  if (!s) throw new ValidationError(`This class has no week ${week}.`);
  return {
    classId,
    className: c.name,
    courseName: c.courseName,
    sessionId: s.id,
    week,
    date: s.date,
    startTime: s.startTime,
    minutes: s.minutes,
    weeks: all.flatMap((r) => (r.week ? [r.week] : [])),
  };
}
