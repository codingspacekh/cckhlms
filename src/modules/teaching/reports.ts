// The weekly class report (FR-TCH-14) and syllabus coverage (FR-TCH-20). The attendance summary is worked
// out from the attendance rows each time, so it always matches what was taken.
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import {
  attendance,
  classReport,
  classReportTopic,
  classSession,
  klass,
  lesson,
  lessonTopic,
  syllabusTopic,
  term,
  user,
} from '@/db/schema';
import { classAccess } from '@/modules/academics/access';
import { whereLabel } from '@/modules/academics/meeting';
import { formatDate, termWeek, todayIn } from '@/modules/academics/schedule';
import { countStatuses, type AttendanceStatus } from '@/modules/attendance/rules';
import { getClubSettings } from '@/modules/club/service';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { assertCan, ValidationError } from '@/server/errors';
import { can } from '@/server/policy';
import { sheetRows } from './report-sheet';
import { sheetTotals, type SheetRow, type SheetTotals } from './report-sheet-rules';
import { weeksOf } from './weeks';

type Opts = { now?: Date };
const MAX_COMMENT = 4000;

async function syllabusOf(classId: string) {
  return db
    .select({ id: syllabusTopic.id, title: syllabusTopic.title })
    .from(syllabusTopic)
    .innerJoin(klass, eq(klass.courseId, syllabusTopic.courseId))
    .where(eq(klass.id, classId))
    .orderBy(asc(syllabusTopic.position));
}

const isHeld = async (date: string, now: Date) => date <= todayIn((await getClubSettings()).timeZone, now);

export type WeeklyReport = {
  sessionId: string;
  week: number;
  date: string;
  open: boolean;
  attendance: ReturnType<typeof countStatuses> | null;
  report: { comment: string; topicIds: string[]; updatedAt: Date; author: string | null } | null;
  suggestedTopicIds: string[];
  syllabus: { id: string; title: string }[];
  // The sheet (M14b): a row per student, its totals, and whether this reader may change it.
  className: string;
  where: string | null;
  termId: string;
  termWeek: number | null;
  prevWeek: number | null;
  nextWeek: number | null;
  canWrite: boolean;
  rows: SheetRow[];
  totals: SheetTotals;
};

// The week's report for its class's teachers to write and Admin to read (BR-27); students never see it.
export async function weeklyReport(actor: Actor | null, classId: string, week: number, opts: Opts = {}): Promise<WeeklyReport> {
  assertCan(actor, 'report.read', await classAccess(classId, 'read'));
  const all = await weeksOf(classId);
  const s = all.find((r) => r.week === week);
  if (!s) throw new ValidationError(`This class has no week ${week}.`);
  const [c] = await db
    .select({
      name: klass.name,
      mode: klass.mode,
      room: klass.room,
      termId: klass.termId,
      startDate: term.startDate,
      endDate: term.endDate,
    })
    .from(klass)
    .innerJoin(term, eq(term.id, klass.termId))
    .where(eq(klass.id, classId))
    .limit(1);
  const numbered = all.filter((r) => r.week !== null).map((r) => r.week!);
  const rows = await sheetRows(classId, s.id, s.date);
  const syllabus = await syllabusOf(classId);
  const order = (ids: string[]) => syllabus.map((t) => t.id).filter((id) => ids.includes(id));

  const marks = await db.select({ status: attendance.status }).from(attendance).where(eq(attendance.sessionId, s.id));
  const [found] = await db
    .select({ r: classReport, author: user.name })
    .from(classReport)
    .leftJoin(user, eq(user.id, classReport.authorId))
    .where(eq(classReport.sessionId, s.id))
    .limit(1);
  const r = found?.r;
  const reportTopics = r
    ? (await db.select({ id: classReportTopic.topicId }).from(classReportTopic).where(eq(classReportTopic.reportId, r.id))).map((t) => t.id)
    : [];
  const lessonTopics = (
    await db
      .select({ id: lessonTopic.topicId })
      .from(lessonTopic)
      .innerJoin(lesson, eq(lesson.id, lessonTopic.lessonId))
      .where(eq(lesson.sessionId, s.id))
  ).map((t) => t.id);

  return {
    sessionId: s.id,
    week,
    date: s.date,
    open: await isHeld(s.date, opts.now ?? new Date()),
    attendance: marks.length ? countStatuses(marks.map((m) => m.status as AttendanceStatus)) : null,
    report: r ? { comment: r.comment, topicIds: order(reportTopics), updatedAt: r.updatedAt, author: found.author } : null,
    suggestedTopicIds: order(lessonTopics),
    syllabus,
    className: c!.name,
    where: whereLabel(c!),
    termId: c!.termId,
    termWeek: termWeek(s.date, c!)?.week ?? null,
    prevWeek: numbered.filter((w) => w < week).at(-1) ?? null,
    nextWeek: numbered.find((w) => w > week) ?? null,
    canWrite: can(actor, 'report.write', await classAccess(classId)),
    rows,
    totals: sheetTotals(rows),
  };
}

const reportSchema = z.object({
  comment: z
    .string()
    .trim()
    .max(MAX_COMMENT, `Keep the comment under ${MAX_COMMENT.toLocaleString('en')} characters.`),
  topicIds: z.array(z.string()).max(100),
});

export async function saveWeeklyReport(
  actor: Actor | null,
  sessionId: string,
  raw: { comment: string; topicIds: string[] },
  opts: Opts = {},
) {
  const [s] = await db.select().from(classSession).where(eq(classSession.id, sessionId)).limit(1);
  if (!s) throw new ValidationError('That session no longer exists.');
  assertCan(actor, 'report.write', await classAccess(s.classId));
  if (s.status === 'cancelled') throw new ValidationError('That session is cancelled, so it has no report.');
  if (!(await isHeld(s.date, opts.now ?? new Date())))
    throw new ValidationError(`You can write this report from ${formatDate(s.date)}, the day of the session.`);
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  const topicIds = [...new Set(parsed.data.topicIds)];
  const known = new Set((await syllabusOf(s.classId)).map((t) => t.id));
  if (topicIds.some((id) => !known.has(id))) throw new ValidationError('Choose topics from this course’s syllabus.', 'topicIds');

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(classReport)
      .values({ id: crypto.randomUUID(), sessionId, comment: parsed.data.comment, authorId: actor.userId })
      .onConflictDoUpdate({
        target: classReport.sessionId,
        set: { comment: parsed.data.comment, authorId: actor.userId, updatedAt: new Date() },
      })
      .returning({ id: classReport.id });
    await tx.delete(classReportTopic).where(eq(classReportTopic.reportId, row!.id));
    if (topicIds.length) await tx.insert(classReportTopic).values(topicIds.map((topicId) => ({ reportId: row!.id, topicId })));
    await audit(
      {
        actorId: actor.userId,
        action: 'report.save',
        entity: 'class_report',
        entityId: row!.id,
        detail: { classId: s.classId, date: s.date, topics: topicIds.length },
      },
      tx,
    );
  });
}

// Which reports exist, by session, for the weeks table.
export async function reportedSessions(sessionIds: string[]): Promise<Set<string>> {
  if (!sessionIds.length) return new Set();
  const rows = await db.select({ id: classReport.sessionId }).from(classReport).where(inArray(classReport.sessionId, sessionIds));
  return new Set(rows.map((r) => r.id));
}

export type Coverage = { covered: number; total: number; topics: { id: string; title: string; weeks: number[] }[] };

// Every syllabus topic with the weeks whose report says it was covered (FR-TCH-20).
export async function syllabusCoverage(actor: Actor | null, classId: string): Promise<Coverage> {
  assertCan(actor, 'class.view', await classAccess(classId));
  const sessions = (await weeksOf(classId)).filter((s) => s.week !== null);
  const syllabus = await syllabusOf(classId);
  const rows = sessions.length
    ? await db
        .select({ sessionId: classReport.sessionId, topicId: classReportTopic.topicId })
        .from(classReportTopic)
        .innerJoin(classReport, eq(classReport.id, classReportTopic.reportId))
        .where(
          inArray(
            classReport.sessionId,
            sessions.map((s) => s.id),
          ),
        )
    : [];
  const weekOf = new Map(sessions.map((s) => [s.id, s.week!]));
  const topics = syllabus.map((t) => ({
    ...t,
    weeks: rows
      .filter((r) => r.topicId === t.id)
      .map((r) => weekOf.get(r.sessionId)!)
      .sort((a, b) => a - b),
  }));
  return { covered: topics.filter((t) => t.weeks.length).length, total: topics.length, topics };
}
