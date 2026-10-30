// The weekly report sheet (FR-TCH-14, BR-27; M14b): one row per student who was in the class on the session's day.
// Each cell saves by itself; the first save makes the week's report, so "written" and "missing" keep working. The
// attendance cell isn't saved here: it is the attendance record (src/modules/attendance).
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { attendance, classReport, classReportStudent, classSession, enrolment, user } from '@/db/schema';
import { classAccess } from '@/modules/academics/access';
import { formatDate, todayIn } from '@/modules/academics/schedule';
import { inClassOn, type AttendanceStatus } from '@/modules/attendance/rules';
import { getClubSettings } from '@/modules/club/service';
import type { Actor } from '@/server/actor';
import { assertCan, ValidationError } from '@/server/errors';
import { cellSchema, isHere, type CellInput, type Participation, type SheetRow } from './report-sheet-rules';

type Opts = { now?: Date };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Everyone in the class on the day, with their attendance mark and what the sheet says about them. Not checked:
// callers check who is asking.
export async function sheetRows(classId: string, sessionId: string, date: string): Promise<SheetRow[]> {
  const rows = await db
    .select({
      enrolmentId: enrolment.id,
      name: user.name,
      enrolledOn: enrolment.enrolledOn,
      endedOn: enrolment.endedOn,
      attendance: attendance.status,
      participation: classReportStudent.participation,
      comment: classReportStudent.comment,
      needsSupport: classReportStudent.needsSupport,
      note: classReportStudent.note,
    })
    .from(enrolment)
    .innerJoin(user, eq(user.id, enrolment.studentId))
    .leftJoin(attendance, and(eq(attendance.enrolmentId, enrolment.id), eq(attendance.sessionId, sessionId)))
    .leftJoin(classReport, eq(classReport.sessionId, sessionId))
    .leftJoin(classReportStudent, and(eq(classReportStudent.reportId, classReport.id), eq(classReportStudent.enrolmentId, enrolment.id)))
    .where(eq(enrolment.classId, classId))
    .orderBy(asc(user.name));
  return rows
    .filter((r) => inClassOn(r, date))
    .map((r) => ({
      enrolmentId: r.enrolmentId,
      name: r.name,
      attendance: r.attendance as AttendanceStatus | null,
      participation: r.participation as Participation | null,
      comment: r.comment ?? '',
      needsSupport: r.needsSupport ?? false,
      note: r.note ?? '',
    }));
}

// The session, if the caller teaches its class and it can be written: not cancelled, and from its day on.
async function openForWriting(actor: Actor | null, sessionId: string, now: Date) {
  const [s] = await db.select().from(classSession).where(eq(classSession.id, sessionId)).limit(1);
  if (!s) throw new ValidationError('That session no longer exists.');
  assertCan(actor, 'report.write', await classAccess(s.classId));
  if (s.status === 'cancelled') throw new ValidationError('That session is cancelled, so it has no report.');
  if (s.date > todayIn((await getClubSettings()).timeZone, now))
    throw new ValidationError(`You can write this report from ${formatDate(s.date)}, the day of the session.`);
  return { s, actor };
}

// The week's report, made by the first save; each save marks it as last saved by this teacher.
async function touchReport(tx: Tx, sessionId: string, by: string) {
  const [row] = await tx
    .insert(classReport)
    .values({ id: crypto.randomUUID(), sessionId, comment: '', authorId: by })
    .onConflictDoUpdate({ target: classReport.sessionId, set: { authorId: by, updatedAt: new Date() } })
    .returning({ id: classReport.id });
  return row!.id;
}

const COLUMN = { participation: 'participation', comment: 'comment', note: 'note', needsSupport: 'needsSupport' } as const;

export async function saveSheetCell(actorIn: Actor | null, sessionId: string, enrolmentId: string, raw: CellInput, opts: Opts = {}) {
  const { s, actor } = await openForWriting(actorIn, sessionId, opts.now ?? new Date());
  const parsed = cellSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ValidationError(issue?.message ?? 'Please check that cell.', raw.field);
  }
  const cell = parsed.data;
  const row = (await sheetRows(s.classId, s.id, s.date)).find((r) => r.enrolmentId === enrolmentId);
  if (!row) throw new ValidationError('That student isn’t in this class.');
  if (cell.field === 'participation' && cell.value !== null) {
    if (row.attendance === null)
      throw new ValidationError(`Take attendance first: ${row.name} has no attendance mark for this week.`, 'participation');
    if (!isHere(row.attendance))
      throw new ValidationError(`${row.name} was ${row.attendance}, so there is no participation to mark.`, 'participation');
  }
  const set = { [COLUMN[cell.field]]: cell.value, updatedBy: actor.userId, updatedAt: new Date() };
  await db.transaction(async (tx) => {
    const reportId = await touchReport(tx, s.id, actor.userId);
    await tx
      .insert(classReportStudent)
      .values({ reportId, enrolmentId, ...set })
      .onConflictDoUpdate({ target: [classReportStudent.reportId, classReportStudent.enrolmentId], set });
  });
}

// "Mark everyone here as active": every student who came and has no participation yet.
export async function markEveryoneActive(actorIn: Actor | null, sessionId: string, opts: Opts = {}): Promise<{ marked: number }> {
  const { s, actor } = await openForWriting(actorIn, sessionId, opts.now ?? new Date());
  const todo = (await sheetRows(s.classId, s.id, s.date)).filter((r) => isHere(r.attendance) && r.participation === null);
  if (todo.length) {
    const set = { participation: 'active', updatedBy: actor.userId, updatedAt: new Date() };
    await db.transaction(async (tx) => {
      const reportId = await touchReport(tx, s.id, actor.userId);
      await tx
        .insert(classReportStudent)
        .values(todo.map((r) => ({ reportId, enrolmentId: r.enrolmentId, ...set })))
        .onConflictDoUpdate({ target: [classReportStudent.reportId, classReportStudent.enrolmentId], set });
    });
  }
  return { marked: todo.length };
}
