// Weekend classes and their sessions (FR-ADM-05/06/08, FR-TCH-05, BR-15).
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { classSession, classTeacher, course, klass, term, user } from '@/db/schema';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { addDays, DAY_NAME, formatDate, generateSessions, numberWeeks, overlaps, scheduleLabel, weekdayOf, type Day } from './schedule';

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

async function teacherIdsOf(classId: string) {
  return (await db.select({ id: classTeacher.userId }).from(classTeacher).where(eq(classTeacher.classId, classId))).map((r) => r.id);
}

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
  const roomWarnings: string[] = [];
  for (const o of others) {
    if (!overlaps({ start: c.startTime, minutes: c.minutes }, { start: o.startTime, minutes: o.minutes })) continue;
    const when = scheduleLabel({ day: o.day as Day, startTime: o.startTime, minutes: o.minutes, weeks: o.weeks }).split(' · ')[0];
    for (const t of await teacherIdsOf(o.id)) {
      if (teacherNames.has(t)) warnings.push(`${teacherNames.get(t)} already teaches ${o.name} on ${when}.`);
    }
    if (c.room && o.room && c.room.toLowerCase() === o.room.toLowerCase())
      roomWarnings.push(`${o.room} is booked for ${o.name} on ${when}.`);
  }
  return [...warnings, ...roomWarnings];
}

export async function createClass(actor: Actor | null, raw: ClassInput): Promise<CreateClassResult> {
  assertCan(actor, 'classes.manage');
  const parsed = classInputSchema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  const c = parsed.data;

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
  const [co] = await db.select({ name: course.name }).from(course).where(eq(course.id, c.courseId)).limit(1);
  if (!co) throw new ValidationError('Choose a course from the list.', 'courseId');

  const teacherIds = [c.leadTeacherId, ...c.assistantTeacherIds.filter((id) => id !== c.leadTeacherId)];
  const teachers = await db
    .select({ id: user.id })
    .from(user)
    .where(and(inArray(user.id, teacherIds), isTeacher));
  if (!teachers.some((r) => r.id === c.leadTeacherId)) throw new ValidationError('Choose a teacher as the lead teacher.', 'leadTeacherId');
  if (teachers.length !== teacherIds.length) throw new ValidationError('Every assistant must be a teacher.', 'assistantTeacherIds');

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
  const name = `${co.name} · ${shortDay(c.day)} ${c.startTime}`;
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
  });
  await audit({ actorId: actor.userId, action: 'class.create', entity: 'class', entityId: classId, detail: { name, warnings } });
  return { status: 'created', classId, warnings };
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
  teachers: { userId: string; name: string; role: 'lead' | 'assistant' }[];
  sessions: SessionRow[];
};

export async function getClass(actor: Actor | null, id: string): Promise<ClassDetail> {
  assertCan(actor, 'class.schedule', { classTeacherIds: await teacherIdsOf(id) });
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
  assertCan(actor, 'class.schedule', { classTeacherIds: await teacherIdsOf(s.classId) });
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
  });
  await audit({
    actorId: actor.userId,
    action: 'session.cancel',
    entity: 'class_session',
    entityId: sessionId,
    detail: { date: s.date, reason: reason.data, addedWeek: added },
  });
}

export async function moveSession(actorIn: Actor | null, sessionId: string, input: { date: string; startTime?: string }) {
  const { s, actor } = await sessionForChange(actorIn, sessionId);
  const date = isoDate.safeParse(input.date);
  if (!date.success) throw ValidationError.fromZod(date.error);
  const startTime = input.startTime ? time.safeParse(input.startTime) : null;
  if (startTime && !startTime.success) throw ValidationError.fromZod(startTime.error);
  await dateTaken(s.classId, date.data, sessionId);
  await db
    .update(classSession)
    .set({ date: date.data, startTime: startTime?.data ?? s.startTime })
    .where(eq(classSession.id, sessionId));
  await audit({
    actorId: actor.userId,
    action: 'session.move',
    entity: 'class_session',
    entityId: sessionId,
    detail: { from: s.date, to: date.data },
  });
}

export async function addMakeUpSession(
  actor: Actor | null,
  classId: string,
  input: { date: string; startTime: string; minutes: number | string },
) {
  assertCan(actor, 'class.schedule', { classTeacherIds: await teacherIdsOf(classId) });
  const parsed = z.object({ date: isoDate, startTime: time, minutes: classInputSchema.shape.minutes }).safeParse(input);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  await dateTaken(classId, parsed.data.date);
  const id = crypto.randomUUID();
  await db.insert(classSession).values({
    id,
    classId,
    date: parsed.data.date,
    startTime: parsed.data.startTime,
    minutes: parsed.data.minutes,
    note: 'Make-up session',
  });
  await audit({
    actorId: actor.userId,
    action: 'session.add',
    entity: 'class_session',
    entityId: id,
    detail: { classId, date: parsed.data.date },
  });
  return { id };
}
