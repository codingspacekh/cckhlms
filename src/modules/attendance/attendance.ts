// Attendance (FR-TCH-06, BR-09, BR-17). Saved per tap; the first tap of a session saves everyone else as
// present, so a normal week takes a few seconds. A session with no rows hasn't been taken yet.
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { attendance, classSession, enrolment, user } from '@/db/schema';
import { classAccess } from '@/modules/academics/access';
import { formatDate, todayIn } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { assertCan, ValidationError } from '@/server/errors';
import { ATTENDANCE_STATUSES, attendanceRate, countStatuses, inClassOn, type AttendanceStatus } from './rules';

type Opts = { now?: Date };
type Counts = ReturnType<typeof countStatuses>;

export type AttendanceRow = {
  enrolmentId: string;
  studentId: string;
  name: string;
  status: AttendanceStatus | null;
  note: string | null;
  inClass: boolean;
  enrolledOn: string;
};
export type AttendanceSheet = {
  sessionId: string;
  week: number;
  date: string;
  open: boolean;
  taken: boolean;
  rows: AttendanceRow[];
  counts: Counts;
};

// Everyone who was in the class on the day, plus current students who joined later (shown, not markable).
async function sheetRows(classId: string, sessionId: string, date: string): Promise<AttendanceRow[]> {
  const rows = await db
    .select({
      enrolmentId: enrolment.id,
      studentId: enrolment.studentId,
      name: user.name,
      enrolStatus: enrolment.status,
      enrolledOn: enrolment.enrolledOn,
      endedOn: enrolment.endedOn,
      status: attendance.status,
      note: attendance.note,
    })
    .from(enrolment)
    .innerJoin(user, eq(user.id, enrolment.studentId))
    .leftJoin(attendance, and(eq(attendance.enrolmentId, enrolment.id), eq(attendance.sessionId, sessionId)))
    .where(eq(enrolment.classId, classId))
    .orderBy(asc(user.name));
  return rows
    .filter((r) => inClassOn(r, date) || (r.enrolStatus === 'active' && r.enrolledOn > date))
    .map((r) => ({
      enrolmentId: r.enrolmentId,
      studentId: r.studentId,
      name: r.name,
      status: r.status as AttendanceStatus | null,
      note: r.note,
      inClass: inClassOn(r, date),
      enrolledOn: r.enrolledOn,
    }));
}

const countsOf = (rows: AttendanceRow[]) => countStatuses(rows.filter((r) => r.inClass).map((r) => r.status));

async function isOpen(date: string, now: Date) {
  return date <= todayIn((await getClubSettings()).timeZone, now);
}

export async function attendanceSheet(actor: Actor | null, classId: string, week: number, opts: Opts = {}): Promise<AttendanceSheet> {
  assertCan(actor, 'attendance.mark', await classAccess(classId));
  const s = (await weeksOf(classId)).find((r) => r.week === week);
  if (!s) throw new ValidationError(`This class has no week ${week}.`);
  const rows = await sheetRows(classId, s.id, s.date);
  return {
    sessionId: s.id,
    week,
    date: s.date,
    open: await isOpen(s.date, opts.now ?? new Date()),
    taken: rows.some((r) => r.status !== null),
    rows,
    counts: countsOf(rows),
  };
}

// Loads the session and checks the caller may mark it and that it has started (in club time).
async function openSession(actor: Actor | null, sessionId: string, now: Date) {
  const [s] = await db.select().from(classSession).where(eq(classSession.id, sessionId)).limit(1);
  if (!s) throw new ValidationError('That session no longer exists.');
  assertCan(actor, 'attendance.mark', await classAccess(s.classId));
  if (s.status === 'cancelled') throw new ValidationError('That session is cancelled, so there is no attendance to take.');
  if (!(await isOpen(s.date, now))) throw new ValidationError(`Attendance opens on ${formatDate(s.date)}, the day of the session.`);
  return { s, actor };
}

// Saves "present" for everyone in the class that day who isn't marked yet.
async function fillPresent(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  classId: string,
  sessionId: string,
  date: string,
  by: string,
) {
  const ids = (await sheetRows(classId, sessionId, date)).filter((r) => r.inClass && r.status === null).map((r) => r.enrolmentId);
  if (ids.length)
    await tx
      .insert(attendance)
      .values(ids.map((enrolmentId) => ({ sessionId, enrolmentId, status: 'present', markedBy: by })))
      .onConflictDoNothing();
}

const statusSchema = z.enum(ATTENDANCE_STATUSES, { message: 'Choose present, late, absent or excused.' });
const noteSchema = z.string().trim().max(200, 'Keep the note under 200 characters.');

// The enrolment must belong to this class and cover the session's date (BR-17).
async function checkInClass(s: { classId: string; date: string }, enrolmentId: string) {
  const [e] = await db
    .select({ enrolledOn: enrolment.enrolledOn, endedOn: enrolment.endedOn, name: user.name })
    .from(enrolment)
    .innerJoin(user, eq(user.id, enrolment.studentId))
    .where(and(eq(enrolment.id, enrolmentId), eq(enrolment.classId, s.classId)))
    .limit(1);
  if (!e) throw new ValidationError('That student isn’t in this class.');
  if (!inClassOn(e, s.date))
    throw new ValidationError(
      e.enrolledOn > s.date
        ? `${e.name} joined on ${formatDate(e.enrolledOn)}, after this session.`
        : `${e.name} had left the class by then.`,
    );
}

export async function markAttendance(
  actorIn: Actor | null,
  sessionId: string,
  enrolmentId: string,
  status: AttendanceStatus,
  opts: Opts = {},
): Promise<{ counts: Counts }> {
  const { s, actor } = await openSession(actorIn, sessionId, opts.now ?? new Date());
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  await checkInClass(s, enrolmentId);
  await db.transaction(async (tx) => {
    await tx
      .insert(attendance)
      .values({ sessionId, enrolmentId, status: parsed.data, markedBy: actor.userId })
      .onConflictDoUpdate({
        target: [attendance.sessionId, attendance.enrolmentId],
        set: { status: parsed.data, markedBy: actor.userId, markedAt: new Date() },
      });
    await fillPresent(tx, s.classId, sessionId, s.date, actor.userId);
  });
  return { counts: countsOf(await sheetRows(s.classId, sessionId, s.date)) };
}

export async function markAllPresent(actorIn: Actor | null, sessionId: string, opts: Opts = {}): Promise<{ counts: Counts }> {
  const { s, actor } = await openSession(actorIn, sessionId, opts.now ?? new Date());
  await db.transaction((tx) => fillPresent(tx, s.classId, sessionId, s.date, actor.userId));
  return { counts: countsOf(await sheetRows(s.classId, sessionId, s.date)) };
}

// A note on a student who isn't marked yet marks them present, like a first tap.
export async function setAttendanceNote(actorIn: Actor | null, sessionId: string, enrolmentId: string, note: string, opts: Opts = {}) {
  const { s, actor } = await openSession(actorIn, sessionId, opts.now ?? new Date());
  const parsed = noteSchema.safeParse(note);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  await checkInClass(s, enrolmentId);
  await db.transaction(async (tx) => {
    await fillPresent(tx, s.classId, sessionId, s.date, actor.userId);
    await tx
      .update(attendance)
      .set({ note: parsed.data || null })
      .where(and(eq(attendance.sessionId, sessionId), eq(attendance.enrolmentId, enrolmentId)));
  });
}

// Attendance % for every enrolment of the class (BR-09), keyed by enrolment id.
export async function classAttendance(actor: Actor | null, classId: string) {
  assertCan(actor, 'class.view', await classAccess(classId));
  return attendanceRates(classId);
}

// The same, not checked: for reports, whose callers check who's asking.
export async function attendanceRates(classId: string) {
  const sessions = (await weeksOf(classId)).filter((s) => !s.cancelled);
  const enrolments = await db
    .select({ id: enrolment.id, enrolledOn: enrolment.enrolledOn, endedOn: enrolment.endedOn })
    .from(enrolment)
    .where(eq(enrolment.classId, classId));
  const marks = sessions.length
    ? await db
        .select({ sessionId: attendance.sessionId, enrolmentId: attendance.enrolmentId, status: attendance.status })
        .from(attendance)
        .where(
          inArray(
            attendance.sessionId,
            sessions.map((s) => s.id),
          ),
        )
    : [];
  const byKey = new Map(marks.map((m) => [`${m.sessionId}|${m.enrolmentId}`, m.status as AttendanceStatus]));
  return new Map(
    enrolments.map((e) => [
      e.id,
      attendanceRate(
        sessions.map((s) => ({ date: s.date, status: byKey.get(`${s.id}|${e.id}`) ?? null })),
        e,
      ),
    ]),
  );
}
