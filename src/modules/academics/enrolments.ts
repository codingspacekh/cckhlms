// Enrolments, transfers, rosters and "my classes" (FR-ADM-07/08, BR-17/18/19, FR-STU-01).
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { db } from '@/db/client';
import { classSession, classTeacher, enrolment, klass, term, user } from '@/db/schema';
import { getClubSettings } from '@/modules/club/service';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { classTeacherIds } from './access';
import { formatDate, nextSession, numberWeeks, overlaps, scheduleLabel, todayIn, type Day } from './schedule';

export type EnrolResult = { status: 'enrolled'; enrolmentId: string } | { status: 'needs-confirmation'; warnings: string[] };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.');

async function openClass(classId: string) {
  const [c] = await db
    .select({
      id: klass.id,
      name: klass.name,
      termId: klass.termId,
      day: klass.day,
      startTime: klass.startTime,
      minutes: klass.minutes,
      weeks: klass.weeks,
      capacity: klass.capacity,
      termName: term.name,
      termStatus: term.status,
    })
    .from(klass)
    .innerJoin(term, eq(term.id, klass.termId))
    .where(eq(klass.id, classId))
    .limit(1);
  if (!c) throw new ValidationError('That class no longer exists.');
  if (c.termStatus === 'closed') throw new ValidationError(`${c.termName} is closed, so its classes can't take new students.`);
  return c;
}

async function checkPlace(c: Awaited<ReturnType<typeof openClass>>, studentId: string, ignoreEnrolmentId?: string) {
  const [student] = await db
    .select({ name: user.name, role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, studentId))
    .limit(1);
  if (!student || !(student.role ?? '').split(',').includes('student'))
    throw new ValidationError('That account is not a student.', 'studentId');
  if (student.banned) throw new ValidationError(`${student.name}'s account is switched off. Switch it on first.`, 'studentId');
  const [already] = await db
    .select({ id: enrolment.id })
    .from(enrolment)
    .where(and(eq(enrolment.classId, c.id), eq(enrolment.studentId, studentId), eq(enrolment.status, 'active')))
    .limit(1);
  if (already) throw new ValidationError(`${student.name} is already in ${c.name}.`, 'studentId');
  if (c.capacity) {
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(enrolment)
      .where(and(eq(enrolment.classId, c.id), eq(enrolment.status, 'active')));
    if (n >= c.capacity) throw new ValidationError(`${c.name} is full (${c.capacity} place${c.capacity === 1 ? '' : 's'}).`);
  }
  // Same term, same day, overlapping time: the student can't be in both (FR-ADM-08).
  const others = await db
    .select({ name: klass.name, day: klass.day, startTime: klass.startTime, minutes: klass.minutes, weeks: klass.weeks })
    .from(enrolment)
    .innerJoin(klass, eq(klass.id, enrolment.classId))
    .where(
      and(
        eq(enrolment.studentId, studentId),
        eq(enrolment.status, 'active'),
        eq(klass.termId, c.termId),
        eq(klass.day, c.day),
        ne(klass.id, c.id),
        ignoreEnrolmentId ? ne(enrolment.id, ignoreEnrolmentId) : undefined,
      ),
    );
  const warnings = others
    .filter((o) => overlaps({ start: c.startTime, minutes: c.minutes }, { start: o.startTime, minutes: o.minutes }))
    .map(
      (o) =>
        `${student.name} is already in ${o.name} on ${scheduleLabel({ day: o.day as Day, startTime: o.startTime, minutes: o.minutes, weeks: o.weeks }).split(' · ')[0]}.`,
    );
  return { student, warnings };
}

export async function enrolStudent(
  actor: Actor | null,
  classId: string,
  studentId: string,
  opts: { enrolledOn?: string; confirmClashes?: boolean; now?: Date } = {},
): Promise<EnrolResult> {
  assertCan(actor, 'enrolments.manage');
  const c = await openClass(classId);
  const { warnings } = await checkPlace(c, studentId);
  if (warnings.length && !opts.confirmClashes) return { status: 'needs-confirmation', warnings };
  const enrolledOn = opts.enrolledOn ? isoDate.parse(opts.enrolledOn) : todayIn((await getClubSettings()).timeZone, opts.now);
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(enrolment).values({ id, classId, studentId, enrolledOn });
    await audit(
      {
        actorId: actor.userId,
        action: 'enrolment.create',
        entity: 'enrolment',
        entityId: id,
        detail: { classId, studentId, enrolledOn, warnings },
      },
      tx,
    );
  });
  return { status: 'enrolled', enrolmentId: id };
}

async function activeEnrolment(id: string) {
  const [e] = await db.select().from(enrolment).where(eq(enrolment.id, id)).limit(1);
  if (!e) throw new ValidationError('That enrolment no longer exists.');
  if (e.status !== 'active') throw new ValidationError('That student has already left this class.');
  return e;
}

export async function withdrawEnrolment(actor: Actor | null, enrolmentId: string, input: { on: string }) {
  assertCan(actor, 'enrolments.manage');
  const e = await activeEnrolment(enrolmentId);
  const on = isoDate.parse(input.on);
  if (on < e.enrolledOn) throw new ValidationError(`The leaving date can't be before the join date (${formatDate(e.enrolledOn)}).`);
  await db.transaction(async (tx) => {
    await tx.update(enrolment).set({ status: 'withdrawn', endedOn: on }).where(eq(enrolment.id, enrolmentId));
    await audit({ actorId: actor.userId, action: 'enrolment.withdraw', entity: 'enrolment', entityId: enrolmentId, detail: { on } }, tx);
  });
}

// BR-18: the old enrolment ends and a new one starts on the same day. Scores don't move with the student.
export async function transferEnrolment(
  actor: Actor | null,
  enrolmentId: string,
  toClassId: string,
  input: { on: string; confirmClashes?: boolean },
) {
  assertCan(actor, 'enrolments.manage');
  const e = await activeEnrolment(enrolmentId);
  if (e.classId === toClassId) throw new ValidationError('Choose a different class to move the student to.', 'toClassId');
  const on = isoDate.parse(input.on);
  if (on < e.enrolledOn) throw new ValidationError(`The move date can't be before the join date (${formatDate(e.enrolledOn)}).`);
  const target = await openClass(toClassId);
  const { warnings } = await checkPlace(target, e.studentId, enrolmentId);
  if (warnings.length && !input.confirmClashes) return { status: 'needs-confirmation' as const, warnings };
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.update(enrolment).set({ status: 'withdrawn', endedOn: on }).where(eq(enrolment.id, enrolmentId));
    await tx.insert(enrolment).values({ id, classId: toClassId, studentId: e.studentId, enrolledOn: on, transferredFromId: enrolmentId });
    await audit(
      {
        actorId: actor.userId,
        action: 'enrolment.transfer',
        entity: 'enrolment',
        entityId: id,
        detail: { from: enrolmentId, toClassId, on },
      },
      tx,
    );
  });
  return { status: 'enrolled' as const, enrolmentId: id };
}

export type RosterRow = {
  id: string;
  studentId: string;
  name: string;
  username: string;
  status: 'active' | 'withdrawn' | 'completed';
  enrolledOn: string;
  endedOn: string | null;
  transferredFrom: string | null;
};

export async function listRoster(actor: Actor | null, classId: string): Promise<RosterRow[]> {
  assertCan(actor, 'class.view', { classTeacherIds: await classTeacherIds(classId) });
  const prev = alias(enrolment, 'prev');
  const prevClass = alias(klass, 'prev_class');
  const rows = await db
    .select({
      id: enrolment.id,
      studentId: enrolment.studentId,
      name: user.name,
      username: user.username,
      status: enrolment.status,
      enrolledOn: enrolment.enrolledOn,
      endedOn: enrolment.endedOn,
      transferredFrom: prevClass.name,
    })
    .from(enrolment)
    .innerJoin(user, eq(user.id, enrolment.studentId))
    .leftJoin(prev, eq(prev.id, enrolment.transferredFromId))
    .leftJoin(prevClass, eq(prevClass.id, prev.classId))
    .where(eq(enrolment.classId, classId))
    .orderBy(sql`${enrolment.status} <> 'active'`, asc(user.name));
  return rows.map((r) => ({ ...r, username: r.username ?? '', status: r.status as RosterRow['status'] }));
}

export type MyClass = {
  id: string;
  name: string;
  termName: string;
  day: Day;
  startTime: string;
  minutes: number;
  weeks: number;
  room: string | null;
  teachers: string[];
  students: number;
  nextSession: { date: string; startTime: string; week: number | null } | null;
};

// The classes a teacher teaches, or a student is in now (FR-STU-01). Nobody sees other people's classes.
export async function myClasses(actor: Actor | null, opts: { now?: Date } = {}): Promise<MyClass[]> {
  if (!actor) return [];
  const roles = actor.role.split(',');
  const ids = new Set<string>();
  if (roles.includes('teacher'))
    for (const r of await db.select({ id: classTeacher.classId }).from(classTeacher).where(eq(classTeacher.userId, actor.userId)))
      ids.add(r.id);
  if (roles.includes('student')) {
    for (const r of await db
      .select({ id: enrolment.classId })
      .from(enrolment)
      .where(and(eq(enrolment.studentId, actor.userId), eq(enrolment.status, 'active'))))
      ids.add(r.id);
  }
  if (!ids.size) return [];
  const classIds = [...ids];
  const classes = await db
    .select({
      id: klass.id,
      name: klass.name,
      termName: term.name,
      day: klass.day,
      startTime: klass.startTime,
      minutes: klass.minutes,
      weeks: klass.weeks,
      room: klass.room,
    })
    .from(klass)
    .innerJoin(term, eq(term.id, klass.termId))
    .where(and(inArray(klass.id, classIds), eq(klass.status, 'active'), ne(term.status, 'closed')));
  const teachers = await db
    .select({ classId: classTeacher.classId, name: user.name, role: classTeacher.role })
    .from(classTeacher)
    .innerJoin(user, eq(user.id, classTeacher.userId))
    .where(inArray(classTeacher.classId, classIds));
  const counts = await db
    .select({ classId: enrolment.classId, n: sql<number>`count(*)::int` })
    .from(enrolment)
    .where(and(inArray(enrolment.classId, classIds), eq(enrolment.status, 'active')))
    .groupBy(enrolment.classId);
  const sessions = await db.select().from(classSession).where(inArray(classSession.classId, classIds));
  const tz = (await getClubSettings()).timeZone;
  const now = opts.now ?? new Date();

  return classes
    .map((c) => {
      const mine = sessions
        .filter((s) => s.classId === c.id)
        .map((s) => ({ id: s.id, date: s.date, startTime: s.startTime, cancelled: s.status === 'cancelled' }));
      const weeks = numberWeeks(mine);
      const next = nextSession(mine, now, tz);
      return {
        ...c,
        day: c.day as Day,
        teachers: teachers
          .filter((t) => t.classId === c.id)
          .sort((a, b) => (a.role === 'lead' ? -1 : b.role === 'lead' ? 1 : 0))
          .map((t) => t.name),
        students: counts.find((x) => x.classId === c.id)?.n ?? 0,
        nextSession: next ? { date: next.date, startTime: next.startTime, week: weeks.get(next.id) ?? null } : null,
      };
    })
    .sort((a, b) => (a.nextSession?.date ?? '9999').localeCompare(b.nextSession?.date ?? '9999') || a.startTime.localeCompare(b.startTime));
}
