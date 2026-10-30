// Admin's Weekly reports (FR-ADM-17; M14b): a term and a week, every class that met that week with its report
// (written or missing, attendance, how many were active, who needs support), and the students teachers flagged.
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { classReport, classTeacher, klass, term, user } from '@/db/schema';
import { whereLabel } from '@/modules/academics/meeting';
import { termWeek, todayIn } from '@/modules/academics/schedule';
import type { AttendanceStatus } from '@/modules/attendance/rules';
import { getClubSettings } from '@/modules/club/service';
import { sheetRows } from '@/modules/teaching/report-sheet';
import { isHere, sheetTotals, termWeekList, type Participation, type WeekWindow } from '@/modules/teaching/report-sheet-rules';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { assertCan } from '@/server/errors';

type Opts = { now?: Date };

export type ClassWeekRow = {
  classId: string;
  className: string;
  teacher: string | null;
  mode: string;
  where: string | null;
  classWeek: number;
  date: string;
  state: 'written' | 'missing' | 'not_yet';
  writtenAt: Date | null;
  attendance: { here: number; of: number } | null;
  active: { active: number; here: number } | null;
  needSupport: number;
};
export type SupportRow = {
  enrolmentId: string;
  name: string;
  classId: string;
  className: string;
  classWeek: number;
  attendance: AttendanceStatus | null;
  participation: Participation | null;
  note: string;
};

export async function weeklyReportsOverview(actor: Actor | null, q: { termId?: string; week?: number }, opts: Opts = {}) {
  assertCan(actor, 'reports.overview');
  const today = todayIn((await getClubSettings()).timeZone, opts.now ?? new Date());
  const terms = await db
    .select({ id: term.id, name: term.name, startDate: term.startDate, endDate: term.endDate })
    .from(term)
    .orderBy(desc(term.startDate));
  // The term asked for, else the one running today, else the latest that has started, else the first to come.
  const t =
    terms.find((x) => x.id === q.termId) ??
    terms.find((x) => x.startDate <= today && today <= x.endDate) ??
    terms.find((x) => x.startDate <= today) ??
    terms.at(-1);
  const empty = { terms, term: t ?? null, weeks: [] as WeekWindow[], week: null, rows: [], support: [] };
  if (!t) return { ...empty, tiles: { written: 0, classes: 0, here: 0, of: 0, needSupport: 0 } };

  const weeks = termWeekList(t);
  const thisWeek = termWeek(today, t)?.week ?? (today > t.endDate ? weeks.length : 1);
  const w = weeks.find((x) => x.week === q.week) ?? weeks[thisWeek - 1]!;

  const classes = await db
    .select({ id: klass.id, name: klass.name, mode: klass.mode, room: klass.room })
    .from(klass)
    .where(eq(klass.termId, t.id))
    .orderBy(asc(klass.name));
  const leads = classes.length
    ? await db
        .select({ classId: classTeacher.classId, name: user.name })
        .from(classTeacher)
        .innerJoin(user, eq(user.id, classTeacher.userId))
        .where(
          and(
            inArray(
              classTeacher.classId,
              classes.map((c) => c.id),
            ),
            eq(classTeacher.role, 'lead'),
          ),
        )
    : [];

  const rows: ClassWeekRow[] = [];
  const support: SupportRow[] = [];
  for (const c of classes) {
    const s = (await weeksOf(c.id)).find((x) => !x.cancelled && x.date >= w.from && x.date <= w.to);
    if (!s) continue;
    const [students, [report]] = await Promise.all([
      sheetRows(c.id, s.id, s.date),
      db.select({ updatedAt: classReport.updatedAt }).from(classReport).where(eq(classReport.sessionId, s.id)).limit(1),
    ]);
    const totals = sheetTotals(students);
    rows.push({
      classId: c.id,
      className: c.name,
      teacher: leads.find((l) => l.classId === c.id)?.name ?? null,
      mode: c.mode,
      where: whereLabel(c),
      classWeek: s.week!,
      date: s.date,
      state: report ? 'written' : s.date < today ? 'missing' : 'not_yet',
      writtenAt: report?.updatedAt ?? null,
      attendance: totals.taken ? { here: totals.here, of: totals.of } : null,
      active: report && totals.taken ? { active: totals.active, here: totals.here } : null,
      needSupport: totals.needSupport,
    });
    for (const r of students.filter((x) => x.needsSupport))
      support.push({
        enrolmentId: r.enrolmentId,
        name: r.name,
        classId: c.id,
        className: c.name,
        classWeek: s.week!,
        attendance: r.attendance,
        participation: isHere(r.attendance) ? r.participation : null,
        note: r.note,
      });
  }
  const taken = rows.filter((r) => r.attendance);
  return {
    terms,
    term: t,
    weeks,
    week: w,
    rows,
    support: support.sort((a, b) => a.name.localeCompare(b.name)),
    tiles: {
      written: rows.filter((r) => r.state === 'written').length,
      classes: rows.length,
      here: taken.reduce((n, r) => n + r.attendance!.here, 0),
      of: taken.reduce((n, r) => n + r.attendance!.of, 0),
      needSupport: support.length,
    },
  };
}
export type WeeklyReportsOverview = Awaited<ReturnType<typeof weeklyReportsOverview>>;
