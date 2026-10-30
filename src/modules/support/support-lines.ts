// Support lines (FR-ADM-18, FR-STU-13, BR-29; M14c): Admin puts students who need help into one extra online
// session, on any day agreed with their guardians. Its students see it on My week and their class teachers on Today
// until it ends, both with a notification. A student sees no other names; a teacher sees only their own students and
// how many others there are. Nothing is sent outside the app.
import { and, asc, desc, eq, gte, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  classReport,
  classReportStudent,
  classSession,
  classTeacher,
  enrolment,
  klass,
  supportLine,
  supportLineStudent,
  term,
  user,
} from '@/db/schema';
import { meetingLinkProblem } from '@/modules/academics/meeting';
import { addDays, toClubTime, todayIn } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { hasEnded, hasStarted, supportLineSchema, supportNotice, supportWhen, type SupportLineInput } from './rules';

type Opts = { now?: Date };
type Line = typeof supportLine.$inferSelect;

export type Candidate = { enrolmentId: string; name: string; className: string; teachers: string[]; why: string | null };
export type LineValues = { id: string | null; date: string; startTime: string; minutes: number; meetingUrl: string; message: string };

const clubNow = async (now: Date) => toClubTime(now, (await getClubSettings()).timeZone);

// Each class's teachers, the lead first.
async function teachersOf(classIds: string[]): Promise<Map<string, string[]>> {
  const rows = classIds.length
    ? await db
        .select({ classId: classTeacher.classId, name: user.name, role: classTeacher.role })
        .from(classTeacher)
        .innerJoin(user, eq(user.id, classTeacher.userId))
        .where(inArray(classTeacher.classId, classIds))
    : [];
  const by = new Map<string, string[]>();
  for (const r of rows.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'lead' ? -1 : 1)))
    by.set(r.classId, [...(by.get(r.classId) ?? []), r.name]);
  return by;
}

// The latest note a teacher wrote on a weekly report sheet when flagging each of these students (M14b).
async function latestNotes(enrolmentIds: string[]): Promise<Map<string, string>> {
  if (!enrolmentIds.length) return new Map();
  const rows = await db
    .selectDistinctOn([classReportStudent.enrolmentId], { enrolmentId: classReportStudent.enrolmentId, note: classReportStudent.note })
    .from(classReportStudent)
    .innerJoin(classReport, eq(classReport.id, classReportStudent.reportId))
    .innerJoin(classSession, eq(classSession.id, classReport.sessionId))
    .where(and(inArray(classReportStudent.enrolmentId, enrolmentIds), eq(classReportStudent.needsSupport, true)))
    .orderBy(classReportStudent.enrolmentId, desc(classSession.date));
  return new Map(rows.filter((r) => r.note).map((r) => [r.enrolmentId, r.note]));
}

// Everyone who can be put in a support line: each student in an active class of a term that isn't closed.
async function candidates(): Promise<Candidate[]> {
  const rows = await db
    .select({ enrolmentId: enrolment.id, name: user.name, classId: klass.id, className: klass.name })
    .from(enrolment)
    .innerJoin(user, eq(user.id, enrolment.studentId))
    .innerJoin(klass, eq(klass.id, enrolment.classId))
    .innerJoin(term, eq(term.id, klass.termId))
    .where(and(eq(enrolment.status, 'active'), eq(klass.status, 'active'), ne(term.status, 'closed')))
    .orderBy(asc(user.name), asc(klass.name));
  const [teachers, notes] = await Promise.all([
    teachersOf([...new Set(rows.map((r) => r.classId))]),
    latestNotes(rows.map((r) => r.enrolmentId)),
  ]);
  return rows.map((r) => ({
    enrolmentId: r.enrolmentId,
    name: r.name,
    className: r.className,
    teachers: teachers.get(r.classId) ?? [],
    why: notes.get(r.enrolmentId) ?? null,
  }));
}

async function lineById(id: string) {
  const [l] = await db.select().from(supportLine).where(eq(supportLine.id, id)).limit(1);
  if (!l) throw new ValidationError('That support line no longer exists.');
  return l;
}
const studentsOf = async (id: string) =>
  (await db.select({ id: supportLineStudent.enrolmentId }).from(supportLineStudent).where(eq(supportLineStudent.supportLineId, id))).map(
    (r) => r.id,
  );

// What the form needs: the students to choose from, the ones already in it, and the link the last line used.
// `change` opens a support line to change it; `copy` starts a new one from it, on another day.
export async function supportLineForm(actor: Actor | null, q: { picked: string[]; change?: string; copy?: string }) {
  assertCan(actor, 'supportlines.manage');
  const all = await candidates();
  const from = q.change ?? q.copy;
  const l = from ? await lineById(from) : null;
  const wanted = l ? await studentsOf(l.id) : q.picked;
  const known = new Set(all.map((c) => c.enrolmentId));
  const [last] = await db.select({ url: supportLine.meetingUrl }).from(supportLine).orderBy(desc(supportLine.createdAt)).limit(1);
  const line: LineValues | null = l
    ? {
        id: q.change ? l.id : null,
        date: q.change ? l.date : '',
        startTime: l.startTime,
        minutes: l.minutes,
        meetingUrl: l.meetingUrl,
        message: l.message,
      }
    : null;
  return { candidates: all, picked: [...new Set(wanted)].filter((id) => known.has(id)), lastMeetingUrl: last?.url ?? null, line };
}

// A line can change until it starts, and not once cancelled.
function assertChangeable(l: Line, now: { date: string; time: string }) {
  if (l.cancelledAt) throw new ValidationError('That support line is cancelled, so it can’t be changed.');
  if (hasStarted(l, now)) throw new ValidationError('That support line has started, so it can’t be changed.');
}

export async function saveSupportLine(actor: Actor | null, id: string | null, raw: SupportLineInput, opts: Opts = {}) {
  assertCan(actor, 'supportlines.manage');
  const now = opts.now ?? new Date();
  const club = await clubNow(now);
  const old = id ? await lineById(id) : null;
  if (old) assertChangeable(old, club);
  const parsed = supportLineSchema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  const c = parsed.data;
  const linkProblem = meetingLinkProblem(c.meetingUrl, 'Paste the support line’s Zoom link.');
  if (linkProblem) throw new ValidationError(linkProblem, 'meetingUrl');
  if (hasStarted(c, club)) throw new ValidationError('Choose a day and time that haven’t passed.', 'date');
  const known = new Set((await candidates()).map((x) => x.enrolmentId));
  if (c.enrolmentIds.some((e) => !known.has(e))) throw new ValidationError('Choose students who are in a class now.', 'enrolmentIds');

  const lineId = old?.id ?? crypto.randomUUID();
  const values = { date: c.date, startTime: c.startTime, minutes: c.minutes, meetingUrl: c.meetingUrl.trim(), message: c.message };
  await db.transaction(async (tx) => {
    if (old) {
      await tx
        .update(supportLine)
        .set({ ...values, updatedAt: now })
        .where(eq(supportLine.id, lineId));
      await tx.delete(supportLineStudent).where(eq(supportLineStudent.supportLineId, lineId));
    } else await tx.insert(supportLine).values({ id: lineId, ...values, createdBy: actor.userId, createdAt: now, updatedAt: now });
    await tx.insert(supportLineStudent).values(c.enrolmentIds.map((enrolmentId) => ({ supportLineId: lineId, enrolmentId })));
    await audit(
      {
        actorId: actor.userId,
        action: old ? 'support_line.update' : 'support_line.create',
        entity: 'support_line',
        entityId: lineId,
        detail: { date: c.date, startTime: c.startTime, minutes: c.minutes, students: c.enrolmentIds.length },
      },
      tx,
    );
  });
  return { id: lineId };
}

export async function cancelSupportLine(actor: Actor | null, id: string, opts: Opts = {}) {
  assertCan(actor, 'supportlines.manage');
  const now = opts.now ?? new Date();
  const l = await lineById(id);
  if (l.cancelledAt) throw new ValidationError('That support line is already cancelled.');
  assertChangeable(l, await clubNow(now));
  await db.transaction(async (tx) => {
    await tx.update(supportLine).set({ cancelledAt: now }).where(eq(supportLine.id, id));
    await audit(
      {
        actorId: actor.userId,
        action: 'support_line.cancel',
        entity: 'support_line',
        entityId: id,
        detail: { date: l.date, startTime: l.startTime },
      },
      tx,
    );
  });
}

// The people in each of these lines: student, their class and its teachers.
async function peopleIn(lineIds: string[]) {
  if (!lineIds.length) return [];
  const rows = await db
    .select({
      lineId: supportLineStudent.supportLineId,
      enrolmentId: enrolment.id,
      studentId: enrolment.studentId,
      name: user.name,
      classId: klass.id,
      className: klass.name,
    })
    .from(supportLineStudent)
    .innerJoin(enrolment, eq(enrolment.id, supportLineStudent.enrolmentId))
    .innerJoin(user, eq(user.id, enrolment.studentId))
    .innerJoin(klass, eq(klass.id, enrolment.classId))
    .where(inArray(supportLineStudent.supportLineId, lineIds))
    .orderBy(asc(user.name));
  const teachers = await db
    .select({ classId: classTeacher.classId, userId: classTeacher.userId, name: user.name })
    .from(classTeacher)
    .innerJoin(user, eq(user.id, classTeacher.userId))
    .where(inArray(classTeacher.classId, [...new Set(rows.map((r) => r.classId))]));
  return rows.map((r) => ({ ...r, teachers: teachers.filter((t) => t.classId === r.classId) }));
}

export type SupportLineRow = {
  id: string;
  when: string;
  date: string;
  students: string[];
  teachers: string[];
  status: 'upcoming' | 'done' | 'cancelled';
  canChange: boolean;
};

// Admin's list: the ones to come first (soonest first), then the last 90 days' (newest first).
export async function listSupportLines(actor: Actor | null, opts: Opts = {}): Promise<SupportLineRow[]> {
  assertCan(actor, 'supportlines.manage');
  const club = await clubNow(opts.now ?? new Date());
  const lines = await db
    .select()
    .from(supportLine)
    .where(gte(supportLine.date, addDays(club.date, -90)))
    .orderBy(asc(supportLine.date), asc(supportLine.startTime));
  const people = await peopleIn(lines.map((l) => l.id));
  const rows = lines.map((l) => {
    const mine = people.filter((p) => p.lineId === l.id);
    const status: SupportLineRow['status'] = l.cancelledAt ? 'cancelled' : hasEnded(l, club) ? 'done' : 'upcoming';
    return {
      id: l.id,
      when: supportWhen(l),
      date: l.date,
      students: mine.map((p) => p.name),
      teachers: [...new Set(mine.flatMap((p) => p.teachers.map((t) => t.name)))].sort(),
      status,
      canChange: !l.cancelledAt && !hasStarted(l, club),
    };
  });
  return [...rows.filter((r) => r.status === 'upcoming'), ...rows.filter((r) => r.status !== 'upcoming').reverse()];
}

// Lines that haven't ended or been cancelled, soonest first.
async function liveLines(lineIds: string[], now: Date) {
  if (!lineIds.length) return [];
  const club = await clubNow(now);
  const lines = await db
    .select()
    .from(supportLine)
    .where(and(inArray(supportLine.id, lineIds), isNull(supportLine.cancelledAt), gte(supportLine.date, addDays(club.date, -1))))
    .orderBy(asc(supportLine.date), asc(supportLine.startTime));
  return lines.filter((l) => !hasEnded(l, club));
}

const linesOfStudent = async (studentId: string) =>
  db
    .select({ lineId: supportLineStudent.supportLineId, classId: enrolment.classId, className: klass.name })
    .from(supportLineStudent)
    .innerJoin(enrolment, eq(enrolment.id, supportLineStudent.enrolmentId))
    .innerJoin(klass, eq(klass.id, enrolment.classId))
    .where(and(eq(enrolment.studentId, studentId), eq(enrolment.status, 'active')));

const linesOfTeacher = async (teacherId: string) =>
  db
    .selectDistinct({ lineId: supportLineStudent.supportLineId })
    .from(supportLineStudent)
    .innerJoin(enrolment, eq(enrolment.id, supportLineStudent.enrolmentId))
    .innerJoin(classTeacher, and(eq(classTeacher.classId, enrolment.classId), eq(classTeacher.userId, teacherId)));

export type StudentSupportLine = {
  id: string;
  date: string;
  startTime: string;
  minutes: number;
  meetingUrl: string;
  message: string;
  teachers: string[];
};

// A student's support lines on My week: when, the link, the message and their class teachers. No other names.
export async function mySupportLines(actor: Actor | null, opts: Opts = {}): Promise<StudentSupportLine[]> {
  assertCan(actor, 'student.area');
  const mine = await linesOfStudent(actor.userId);
  const lines = await liveLines([...new Set(mine.map((m) => m.lineId))], opts.now ?? new Date());
  const teachers = await teachersOf([...new Set(mine.map((m) => m.classId))]);
  return lines.map((l) => ({
    id: l.id,
    date: l.date,
    startTime: l.startTime,
    minutes: l.minutes,
    meetingUrl: l.meetingUrl,
    message: l.message,
    teachers: [...new Set(mine.filter((m) => m.lineId === l.id).flatMap((m) => teachers.get(m.classId) ?? []))],
  }));
}

export type TeacherSupportLine = Omit<StudentSupportLine, 'teachers'> & {
  students: { name: string; className: string; note: string | null }[];
  others: number;
};

// A teacher's support lines on Today: their own students in it, with their latest weekly note, and how many others.
export async function teacherSupportLines(actor: Actor | null, opts: Opts = {}): Promise<TeacherSupportLine[]> {
  assertCan(actor, 'teacher.area');
  const lines = await liveLines(
    (await linesOfTeacher(actor.userId)).map((r) => r.lineId),
    opts.now ?? new Date(),
  );
  const people = await peopleIn(lines.map((l) => l.id));
  const own = people.filter((p) => p.teachers.some((t) => t.userId === actor.userId));
  const notes = await latestNotes(own.map((p) => p.enrolmentId));
  return lines.map((l) => {
    const inLine = people.filter((p) => p.lineId === l.id);
    const mine = own.filter((p) => p.lineId === l.id);
    return {
      id: l.id,
      date: l.date,
      startTime: l.startTime,
      minutes: l.minutes,
      meetingUrl: l.meetingUrl,
      message: l.message,
      students: mine.map((p) => ({ name: p.name, className: p.className, note: notes.get(p.enrolmentId) ?? null })),
      others: inLine.length - mine.length,
    };
  });
}

// Support lines in the notification feed (FR-STU-09): made, changed or cancelled, for the people in them.
export async function supportLineNotifications(userId: string, area: 'student' | 'teacher', since: Date) {
  const tz = (await getClubSettings()).timeZone;
  const links =
    area === 'student' ? await linesOfStudent(userId) : (await linesOfTeacher(userId)).map((r) => ({ lineId: r.lineId, className: '' }));
  const ids = [...new Set(links.map((l) => l.lineId))];
  if (!ids.length) return [];
  const lines = await db
    .select()
    .from(supportLine)
    .where(and(inArray(supportLine.id, ids), gte(supportLine.date, todayIn(tz, since))));
  const people = area === 'teacher' ? await peopleIn(ids) : [];
  return lines.map((l) => {
    const n = supportNotice(l);
    const own = people.filter((p) => p.lineId === l.id && p.teachers.some((t) => t.userId === userId)).length;
    return {
      ...n,
      kind: 'support_line' as const,
      detail: l.cancelledAt ? '' : area === 'student' ? 'Online on Zoom · Join from My week' : `${own} of your students · on Today`,
      href: area === 'student' ? '/student' : '/teacher',
      className: links.find((x) => x.lineId === l.id)?.className ?? '',
    };
  });
}
