// Weekend classes and their sessions (FR-ADM-05/06/08, FR-TCH-05, BR-15).
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { assessment, attendance, classReport, classSession, classTeacher, course, enrolment, klass, lesson, term, user } from '@/db/schema';
import { getClubSettings } from '@/modules/club/service';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { classAccess, classTeacherIds } from './access';
import {
  addDays,
  DAY_NAME,
  formatDate,
  generateSessions,
  numberWeeks,
  overlaps,
  scheduleLabel,
  todayIn,
  weekdayOf,
  type Day,
} from './schedule';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:00.');
const list = z.preprocess((v) => (v == null ? [] : Array.isArray(v) ? v : [v]), z.array(z.string()));

export const classInputSchema = z.object({
  courseId: z.string().min(1, 'Choose a course.'),
  termId: z.string().min(1, 'Choose a term.'),
  day: z.enum(['sat', 'sun'], { message: 'Choose Saturday or Sunday.' }),
  startTime: time,
  minutes: z.coerce.number().refine((m) => m === 90 || m === 120, 'Sessions are 90 or 120 minutes.'),
  firstDate: isoDate,
  weeks: z.coerce.number().int().min(10, 'Classes run 10 to 12 weeks.').max(12, 'Classes run 10 to 12 weeks.'),
  room: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(40, 'That room name is too long.').optional(),
  ),
  capacity: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().int().min(1).max(60).optional()),
  leadTeacherId: z.string().min(1, 'Choose a lead teacher.'),
  assistantTeacherIds: list.default([]),
  cancelledDates: list.default([]),
  confirmClashes: z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean()).default(false),
});
export type ClassInput = Partial<Record<keyof z.input<typeof classInputSchema>, unknown>>;
export type CreateClassResult =
  { status: 'created'; classId: string; warnings: string[] } | { status: 'needs-confirmation'; warnings: string[] };

const shortDay = (d: Day) => (d === 'sat' ? 'Sat' : 'Sun');
const isTeacher = sql`'teacher' = any(string_to_array(${user.role}, ','))`;

async function findClashes(c: {
  termId: string;
  day: Day;
  startTime: string;
  minutes: number;
  room?: string;
  teacherIds: string[];
  excludeClassId?: string;
}) {
  const others = await db
    .select({
      id: klass.id,
      name: klass.name,
      day: klass.day,
      startTime: klass.startTime,
      minutes: klass.minutes,
      weeks: klass.weeks,
      room: klass.room,
    })
    .from(klass)
    .where(
      and(
        eq(klass.termId, c.termId),
        eq(klass.day, c.day),
        eq(klass.status, 'active'),
        c.excludeClassId ? ne(klass.id, c.excludeClassId) : undefined,
      ),
    );
  const warnings: string[] = [];
  const teacherNames = new Map(
    c.teacherIds.length
      ? (await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, c.teacherIds))).map((u) => [u.id, u.name])
      : [],
  );
  const overlapping = others.filter((o) =>
    overlaps({ start: c.startTime, minutes: c.minutes }, { start: o.startTime, minutes: o.minutes }),
  );
  // One query for every overlapping class, not one per class.
  const overlappingIds = overlapping.map((o) => o.id);
  const busy =
    overlappingIds.length && c.teacherIds.length
      ? await db
          .select({ classId: classTeacher.classId, userId: classTeacher.userId })
          .from(classTeacher)
          .where(and(inArray(classTeacher.classId, overlappingIds), inArray(classTeacher.userId, c.teacherIds)))
      : [];
  const roomWarnings: string[] = [];
  for (const o of overlapping) {
    const when = scheduleLabel({ day: o.day as Day, startTime: o.startTime, minutes: o.minutes, weeks: o.weeks }).split(' · ')[0];
    for (const t of busy) {
      if (t.classId === o.id && teacherNames.has(t.userId))
        warnings.push(`${teacherNames.get(t.userId)} already teaches ${o.name} on ${when}.`);
    }
    if (c.room && o.room && c.room.toLowerCase() === o.room.toLowerCase())
      roomWarnings.push(`${o.room} is booked for ${o.name} on ${when}.`);
  }
  return [...warnings, ...roomWarnings];
}

// The checks shared by creating and editing a class.
async function checkTermAndDate(c: { termId: string; day: Day; firstDate: string }) {
  if (weekdayOf(c.firstDate) !== c.day) {
    throw new ValidationError(
      `${formatDate(c.firstDate)} is not a ${DAY_NAME[c.day]}. Pick a ${DAY_NAME[c.day]} for the first session.`,
      'firstDate',
    );
  }
  const [t] = await db.select().from(term).where(eq(term.id, c.termId)).limit(1);
  if (!t) throw new ValidationError('Choose a term from the list.', 'termId');
  if (t.status === 'closed') throw new ValidationError(`${t.name} is closed. Choose a planned or active term.`, 'termId');
  if (c.firstDate < t.startDate || c.firstDate > t.endDate) {
    throw new ValidationError(
      `The first session must be inside ${t.name} (${formatDate(t.startDate)} – ${formatDate(t.endDate)}).`,
      'firstDate',
    );
  }
}

async function nameOfCourse(courseId: string) {
  const [co] = await db.select({ name: course.name }).from(course).where(eq(course.id, courseId)).limit(1);
  if (!co) throw new ValidationError('Choose a course from the list.', 'courseId');
  return co.name;
}

// The lead first, then the assistants; every one of them must be a teacher.
async function checkTeachers(leadId: string, assistantIds: string[]) {
  const teacherIds = [leadId, ...new Set(assistantIds.filter((id) => id !== leadId))];
  const teachers = await db
    .select({ id: user.id })
    .from(user)
    .where(and(inArray(user.id, teacherIds), isTeacher));
  if (!teachers.some((r) => r.id === leadId)) throw new ValidationError('Choose a teacher as the lead teacher.', 'leadTeacherId');
  if (teachers.length !== teacherIds.length) throw new ValidationError('Every assistant must be a teacher.', 'assistantTeacherIds');
  return teacherIds;
}

// The name a class gets when it is created, e.g. "Python Level 1 · Sat 09:00".
const autoName = (courseName: string, day: Day, startTime: string) => `${courseName} · ${shortDay(day)} ${startTime}`;

export async function createClass(actor: Actor | null, raw: ClassInput): Promise<CreateClassResult> {
  assertCan(actor, 'classes.manage');
  const parsed = classInputSchema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  const c = parsed.data;

  await checkTermAndDate(c);
  const courseName = await nameOfCourse(c.courseId);
  const teacherIds = await checkTeachers(c.leadTeacherId, c.assistantTeacherIds);

  const warnings = await findClashes({
    termId: c.termId,
    day: c.day,
    startTime: c.startTime,
    minutes: c.minutes,
    room: c.room,
    teacherIds,
  });
  if (warnings.length && !c.confirmClashes) return { status: 'needs-confirmation', warnings };

  const classId = crypto.randomUUID();
  const name = autoName(courseName, c.day, c.startTime);
  await db.transaction(async (tx) => {
    await tx.insert(klass).values({
      id: classId,
      courseId: c.courseId,
      termId: c.termId,
      name,
      day: c.day,
      startTime: c.startTime,
      minutes: c.minutes,
      firstDate: c.firstDate,
      weeks: c.weeks,
      room: c.room ?? null,
      capacity: c.capacity ?? null,
    });
    await tx
      .insert(classTeacher)
      .values(teacherIds.map((id) => ({ classId, userId: id, role: id === c.leadTeacherId ? 'lead' : 'assistant' })));
    await tx.insert(classSession).values(
      generateSessions({ firstDate: c.firstDate, weeks: c.weeks, cancelledDates: c.cancelledDates }).map((s) => ({
        id: crypto.randomUUID(),
        classId,
        date: s.date,
        startTime: c.startTime,
        minutes: c.minutes,
        status: s.cancelled ? 'cancelled' : 'scheduled',
        note: s.cancelled ? 'No class (set when the class was created)' : null,
      })),
    );
    await audit({ actorId: actor.userId, action: 'class.create', entity: 'class', entityId: classId, detail: { name, warnings } }, tx);
  });
  return { status: 'created', classId, warnings };
}

// What is in a class already (BR-23): enrolments ever made, and lessons, work, attendance and weekly reports.
async function classUse(classId: string) {
  const inSession = (table: typeof lesson | typeof attendance | typeof classReport) =>
    sql<number>`(select count(*)::int from ${table} x join ${classSession} s on s.id = x.session_id where s.class_id = ${classId})`;
  const [u] = await db
    .select({
      students: sql<number>`(select count(*)::int from ${enrolment} e where e.class_id = ${classId})`,
      work: sql<number>`(select count(*)::int from ${assessment} a where a.class_id = ${classId})`,
      lessons: inSession(lesson),
      attendance: inSession(attendance),
      reports: inSession(classReport),
    })
    .from(sql`(select 1) as one`);
  return u!;
}

// A class has started once a session date has passed or anything was put in it (enrolments don't count: students
// are enrolled before week 1). From then on its course, term, day and dates are fixed.
async function hasStarted(classId: string, today: string) {
  const use = await classUse(classId);
  const [passed] = await db
    .select({ id: classSession.id })
    .from(classSession)
    .where(and(eq(classSession.classId, classId), sql`${classSession.date} < ${today}`))
    .limit(1);
  return !!passed || use.lessons + use.work + use.attendance + use.reports > 0;
}

// For the edit form: whether the course, term, day and dates can still change.
export async function scheduleFixed(actor: Actor | null, classId: string, opts: { now?: Date } = {}): Promise<boolean> {
  assertCan(actor, 'classes.manage');
  return hasStarted(classId, todayIn((await getClubSettings()).timeZone, opts.now));
}

async function classForChange(id: string) {
  const [c] = await db
    .select({ k: klass, courseName: course.name })
    .from(klass)
    .innerJoin(course, eq(course.id, klass.courseId))
    .where(eq(klass.id, id))
    .limit(1);
  if (!c) throw new ValidationError('That class no longer exists.');
  if (c.k.status === 'archived') throw new ValidationError("This class is archived, so it can't be changed. Reopen its term first.");
  return c;
}

export const classEditSchema = classInputSchema.omit({ cancelledDates: true }).extend({
  name: z.string().trim().min(1, 'Give the class a name.').max(100, 'That name is too long.'),
});
export type ClassEdit = Partial<Record<keyof z.input<typeof classEditSchema>, unknown>>;
export type UpdateClassResult = { status: 'saved' | 'needs-confirmation'; warnings: string[] };

// Change a class after it is created (M10). Its name, room, capacity, teachers, time and length can change at any
// time; a new time or length applies to the sessions still to come that had the old one (a session moved to its own
// time keeps it). Its course, term, day, first date and number of weeks can change only before it starts, and its
// sessions are then made again (cancelled dates stay cancelled).
export async function updateClass(actor: Actor | null, id: string, raw: ClassEdit, opts: { now?: Date } = {}): Promise<UpdateClassResult> {
  assertCan(actor, 'classes.manage');
  const parsed = classEditSchema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  const c = parsed.data;
  const { k: old, courseName: oldCourseName } = await classForChange(id);
  const today = todayIn((await getClubSettings()).timeZone, opts.now);

  const oldTeachers = await db.select().from(classTeacher).where(eq(classTeacher.classId, id));
  const teacherIds = await checkTeachers(c.leadTeacherId, c.assistantTeacherIds);
  const sameTeachers =
    oldTeachers.length === teacherIds.length &&
    oldTeachers.every((t) =>
      t.role === 'lead' ? t.userId === c.leadTeacherId : teacherIds.includes(t.userId) && t.userId !== c.leadTeacherId,
    );
  const room = c.room ?? null;
  const capacity = c.capacity ?? null;
  const differs = {
    course: c.courseId !== old.courseId,
    term: c.termId !== old.termId,
    day: c.day !== old.day,
    firstDate: c.firstDate !== old.firstDate,
    weeks: c.weeks !== old.weeks,
    startTime: c.startTime !== old.startTime,
    minutes: c.minutes !== old.minutes,
    room: room !== old.room,
    capacity: capacity !== old.capacity,
    teachers: !sameTeachers,
  };
  const remake = differs.course || differs.term || differs.day || differs.firstDate || differs.weeks;

  if (remake) {
    if (await hasStarted(id, today))
      throw new ValidationError(
        `${old.name} has started, so its course, term, day, first date and number of weeks can't change. Its time, length, room and teachers still can.`,
      );
    await checkTermAndDate(c);
  }
  const courseName = differs.course ? await nameOfCourse(c.courseId) : oldCourseName;
  // A name the LMS made follows the course, day and time; a name typed by hand is kept.
  const name =
    c.name === old.name && old.name === autoName(oldCourseName, old.day as Day, old.startTime)
      ? autoName(courseName, c.day, c.startTime)
      : c.name;

  let warnings: string[] = [];
  if (differs.term || differs.day || differs.startTime || differs.minutes || differs.room || differs.teachers) {
    warnings = await findClashes({ ...c, teacherIds, excludeClassId: id });
    if (warnings.length && !c.confirmClashes) return { status: 'needs-confirmation', warnings };
  }

  const changed = [...(name !== old.name ? ['name'] : []), ...Object.keys(differs).filter((f) => differs[f as keyof typeof differs])];
  await db.transaction(async (tx) => {
    await tx
      .update(klass)
      .set({
        name,
        courseId: c.courseId,
        termId: c.termId,
        day: c.day,
        startTime: c.startTime,
        minutes: c.minutes,
        firstDate: c.firstDate,
        weeks: c.weeks,
        room,
        capacity,
      })
      .where(eq(klass.id, id));
    if (differs.teachers) {
      await tx.delete(classTeacher).where(eq(classTeacher.classId, id));
      await tx
        .insert(classTeacher)
        .values(teacherIds.map((userId) => ({ classId: id, userId, role: userId === c.leadTeacherId ? 'lead' : 'assistant' })));
    }
    if (remake) {
      const cancelled = await tx
        .select({ date: classSession.date, note: classSession.note })
        .from(classSession)
        .where(and(eq(classSession.classId, id), eq(classSession.status, 'cancelled')));
      const notes = new Map(cancelled.map((s) => [s.date, s.note]));
      await tx.delete(classSession).where(eq(classSession.classId, id));
      await tx.insert(classSession).values(
        generateSessions({ firstDate: c.firstDate, weeks: c.weeks, cancelledDates: [...notes.keys()] }).map((s) => ({
          id: crypto.randomUUID(),
          classId: id,
          date: s.date,
          startTime: c.startTime,
          minutes: c.minutes,
          status: s.cancelled ? 'cancelled' : 'scheduled',
          note: s.cancelled ? (notes.get(s.date) ?? null) : null,
        })),
      );
    } else if (differs.startTime || differs.minutes) {
      await tx
        .update(classSession)
        .set({ startTime: c.startTime, minutes: c.minutes })
        .where(
          and(
            eq(classSession.classId, id),
            eq(classSession.status, 'scheduled'),
            sql`${classSession.date} >= ${today}`,
            eq(classSession.startTime, old.startTime),
            eq(classSession.minutes, old.minutes),
          ),
        );
    }
    await audit({ actorId: actor.userId, action: 'class.update', entity: 'class', entityId: id, detail: { name, changed, warnings } }, tx);
  });
  return { status: 'saved', warnings };
}

// Only a class nothing is in yet (BR-23): no student was ever enrolled, and it has no lessons, work, attendance or
// weekly reports. Its sessions and teachers go with it.
export async function deleteClass(actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, 'classes.manage');
  const { k } = await classForChange(id);
  const use = await classUse(id);
  const parts = [
    [use.students, 'student'],
    [use.lessons, 'lesson'],
    [use.work, 'piece of work', 'pieces of work'],
    [use.attendance, 'attendance mark'],
    [use.reports, 'weekly report'],
  ] as const;
  const inUse = parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : (many ?? `${one}s`)}`);
  if (inUse.length)
    throw new ValidationError(`${k.name} has ${inUse.join(', ')}, so it can't be deleted. It is kept with its term instead.`);
  await db.transaction(async (tx) => {
    await tx.delete(klass).where(eq(klass.id, id));
    await audit({ actorId: actor.userId, action: 'class.delete', entity: 'class', entityId: id, detail: { name: k.name } }, tx);
  });
}

export type ClassRow = {
  id: string;
  name: string;
  courseCode: string;
  courseName: string;
  termName: string;
  day: Day;
  startTime: string;
  minutes: number;
  weeks: number;
  room: string | null;
  leadTeacher: string | null;
  sessions: number;
};

export async function listClasses(actor: Actor | null, filter: { termId?: string } = {}): Promise<ClassRow[]> {
  assertCan(actor, 'classes.manage');
  const rows = await db
    .select({
      id: klass.id,
      name: klass.name,
      courseCode: course.code,
      courseName: course.name,
      termName: term.name,
      day: klass.day,
      startTime: klass.startTime,
      minutes: klass.minutes,
      weeks: klass.weeks,
      room: klass.room,
      leadTeacher: sql<
        string | null
      >`(select u.name from ${classTeacher} ct join ${user} u on u.id = ct.user_id where ct.class_id = ${klass.id} and ct.role = 'lead')`,
      sessions: sql<number>`(select count(*)::int from ${classSession} s where s.class_id = ${klass.id} and s.status = 'scheduled')`,
    })
    .from(klass)
    .innerJoin(course, eq(course.id, klass.courseId))
    .innerJoin(term, eq(term.id, klass.termId))
    .where(filter.termId ? eq(klass.termId, filter.termId) : undefined)
    .orderBy(asc(klass.day), asc(klass.startTime), asc(klass.name));
  return rows.map((r) => ({ ...r, day: r.day as Day }));
}

export type SessionRow = {
  id: string;
  date: string;
  startTime: string;
  minutes: number;
  status: 'scheduled' | 'cancelled';
  note: string | null;
  week: number | null;
};
export type ClassDetail = {
  id: string;
  name: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  termId: string;
  termName: string;
  day: Day;
  startTime: string;
  minutes: number;
  weeks: number;
  firstDate: string;
  room: string | null;
  capacity: number | null;
  status: string;
  promotedAt: Date | null;
  teachers: { userId: string; name: string; role: 'lead' | 'assistant' }[];
  sessions: SessionRow[];
};

export async function getClass(actor: Actor | null, id: string): Promise<ClassDetail> {
  assertCan(actor, 'class.view', { classTeacherIds: await classTeacherIds(id) });
  const [c] = await db
    .select({ k: klass, courseCode: course.code, courseName: course.name, termName: term.name })
    .from(klass)
    .innerJoin(course, eq(course.id, klass.courseId))
    .innerJoin(term, eq(term.id, klass.termId))
    .where(eq(klass.id, id))
    .limit(1);
  if (!c) throw new ValidationError('That class no longer exists.');
  const teachers = (
    await db
      .select({ userId: classTeacher.userId, name: user.name, role: classTeacher.role })
      .from(classTeacher)
      .innerJoin(user, eq(user.id, classTeacher.userId))
      .where(eq(classTeacher.classId, id))
  )
    .map((t) => ({ ...t, role: t.role as 'lead' | 'assistant' }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'lead' ? -1 : 1));
  const raw = await db.select().from(classSession).where(eq(classSession.classId, id)).orderBy(asc(classSession.date));
  const weeks = numberWeeks(raw.map((s) => ({ id: s.id, date: s.date, cancelled: s.status === 'cancelled' })));
  return {
    id: c.k.id,
    name: c.k.name,
    courseId: c.k.courseId,
    courseCode: c.courseCode,
    courseName: c.courseName,
    termId: c.k.termId,
    termName: c.termName,
    day: c.k.day as Day,
    startTime: c.k.startTime,
    minutes: c.k.minutes,
    weeks: c.k.weeks,
    firstDate: c.k.firstDate,
    room: c.k.room,
    capacity: c.k.capacity,
    status: c.k.status,
    promotedAt: c.k.promotedAt,
    teachers,
    sessions: raw.map((s) => ({
      id: s.id,
      date: s.date,
      startTime: s.startTime,
      minutes: s.minutes,
      status: s.status as SessionRow['status'],
      note: s.note,
      week: weeks.get(s.id) ?? null,
    })),
  };
}

async function sessionForChange(actor: Actor | null, sessionId: string) {
  const [s] = await db.select().from(classSession).where(eq(classSession.id, sessionId)).limit(1);
  if (!s) throw new ValidationError('That session no longer exists.');
  assertCan(actor, 'class.schedule', await classAccess(s.classId));
  return { s, actor };
}

async function dateTaken(classId: string, date: string, exceptId?: string) {
  const [hit] = await db
    .select({ id: classSession.id })
    .from(classSession)
    .where(and(eq(classSession.classId, classId), eq(classSession.date, date), exceptId ? ne(classSession.id, exceptId) : undefined))
    .limit(1);
  if (hit) throw new ValidationError(`This class already has a session on ${formatDate(date)}.`, 'date');
}

const noteSchema = z.string().trim().min(1, 'Give a short reason.').max(200, 'Keep the reason under 200 characters.');

export async function cancelSession(actorIn: Actor | null, sessionId: string, input: { reason: string; addWeekAtEnd: boolean }) {
  const { s, actor } = await sessionForChange(actorIn, sessionId);
  if (s.status === 'cancelled') throw new ValidationError('That session is already cancelled.');
  const reason = noteSchema.safeParse(input.reason);
  if (!reason.success) throw ValidationError.fromZod(reason.error);
  let added: string | null = null;
  await db.transaction(async (tx) => {
    await tx.update(classSession).set({ status: 'cancelled', note: reason.data }).where(eq(classSession.id, sessionId));
    if (input.addWeekAtEnd) {
      const [last] = await tx
        .select({ date: classSession.date })
        .from(classSession)
        .where(eq(classSession.classId, s.classId))
        .orderBy(sql`${classSession.date} desc`)
        .limit(1);
      const [k] = await tx
        .select({ startTime: klass.startTime, minutes: klass.minutes })
        .from(klass)
        .where(eq(klass.id, s.classId))
        .limit(1);
      added = addDays(last!.date, 7);
      await tx
        .insert(classSession)
        .values({ id: crypto.randomUUID(), classId: s.classId, date: added, startTime: k!.startTime, minutes: k!.minutes });
    }
    await audit(
      {
        actorId: actor.userId,
        action: 'session.cancel',
        entity: 'class_session',
        entityId: sessionId,
        detail: { date: s.date, reason: reason.data, addedWeek: added },
      },
      tx,
    );
  });
}

export async function moveSession(actorIn: Actor | null, sessionId: string, input: { date: string; startTime?: string }) {
  const { s, actor } = await sessionForChange(actorIn, sessionId);
  const date = isoDate.safeParse(input.date);
  if (!date.success) throw ValidationError.fromZod(date.error);
  const startTime = input.startTime ? time.safeParse(input.startTime) : null;
  if (startTime && !startTime.success) throw ValidationError.fromZod(startTime.error);
  await dateTaken(s.classId, date.data, sessionId);
  await db.transaction(async (tx) => {
    await tx
      .update(classSession)
      .set({ date: date.data, startTime: startTime?.data ?? s.startTime })
      .where(eq(classSession.id, sessionId));
    await audit(
      {
        actorId: actor.userId,
        action: 'session.move',
        entity: 'class_session',
        entityId: sessionId,
        detail: { from: s.date, to: date.data },
      },
      tx,
    );
  });
}

export async function addMakeUpSession(
  actor: Actor | null,
  classId: string,
  input: { date: string; startTime: string; minutes: number | string },
) {
  assertCan(actor, 'class.schedule', await classAccess(classId));
  const parsed = z.object({ date: isoDate, startTime: time, minutes: classInputSchema.shape.minutes }).safeParse(input);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  await dateTaken(classId, parsed.data.date);
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(classSession).values({
      id,
      classId,
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      minutes: parsed.data.minutes,
      note: 'Make-up session',
    });
    await audit(
      { actorId: actor.userId, action: 'session.add', entity: 'class_session', entityId: id, detail: { classId, date: parsed.data.date } },
      tx,
    );
  });
  return { id };
}
