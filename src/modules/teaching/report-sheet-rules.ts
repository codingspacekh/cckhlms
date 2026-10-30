// The weekly report sheet's rules (FR-TCH-14, FR-ADM-17, BR-27; M14b), without the database: who counts as in class,
// the totals row, what a cell may hold, and Admin's weeks of a term.
import { z } from 'zod';
import { addDays, daysBetween } from '@/modules/academics/schedule';
import type { AttendanceStatus } from '@/modules/attendance/rules';

export const PARTICIPATION = ['active', 'not_active'] as const;
export type Participation = (typeof PARTICIPATION)[number];
export const SHEET_TEXT_MAX = 500;

// One student's row of the sheet. Attendance is the attendance record itself (null until it is taken).
export type SheetRow = {
  enrolmentId: string;
  name: string;
  attendance: AttendanceStatus | null;
  participation: Participation | null;
  comment: string;
  needsSupport: boolean;
  note: string;
};

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
};
export const PARTICIPATION_LABEL: Record<Participation, string> = { active: 'Active', not_active: 'Not active' };

// Participation is only for a student who came (BR-27).
export const isHere = (s: AttendanceStatus | null) => s === 'present' || s === 'late';

export function sheetTotals(rows: Pick<SheetRow, 'attendance' | 'participation' | 'comment' | 'needsSupport'>[]) {
  const here = rows.filter((r) => isHere(r.attendance));
  return {
    of: rows.length,
    here: here.length,
    active: here.filter((r) => r.participation === 'active').length,
    needSupport: rows.filter((r) => r.needsSupport).length,
    comments: rows.filter((r) => r.comment.trim()).length,
    taken: rows.some((r) => r.attendance !== null),
  };
}
export type SheetTotals = ReturnType<typeof sheetTotals>;

const text = z.string().trim().max(SHEET_TEXT_MAX, `Keep it under ${SHEET_TEXT_MAX} characters.`);
export const cellSchema = z.discriminatedUnion('field', [
  z.object({
    field: z.literal('participation'),
    value: z.preprocess(
      (v) => (v === '' || v == null ? null : v),
      z.enum(PARTICIPATION, { message: 'Choose active or not active.' }).nullable(),
    ),
  }),
  z.object({ field: z.literal('comment'), value: text }),
  z.object({ field: z.literal('note'), value: text }),
  z.object({ field: z.literal('needsSupport'), value: z.preprocess((v) => v === true || v === 'yes', z.boolean()) }),
]);
export type CellInput = z.input<typeof cellSchema>;
export type SheetField = CellInput['field'];

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (d: string) => ({ day: Number(d.slice(8)), month: MONTH[Number(d.slice(5, 7)) - 1]! });

// "17–18 Oct", or "31 Oct – 1 Nov" across two months.
function rangeLabel(from: string, to: string) {
  const a = dayMonth(from);
  const b = dayMonth(to);
  if (from === to) return `${a.day} ${a.month}`;
  return a.month === b.month ? `${a.day}–${b.day} ${b.month}` : `${a.day} ${a.month} – ${b.day} ${b.month}`;
}

// Admin's week N of a term: seven days from the term's first day (the dashboard's "Week N"), named by its weekend.
export function weekWindow(t: { startDate: string; endDate: string }, week: number) {
  const from = addDays(t.startDate, (week - 1) * 7);
  const last = addDays(from, 6);
  const to = last > t.endDate ? t.endDate : last;
  const weekend = [0, 1, 2, 3, 4, 5, 6]
    .map((i) => addDays(from, i))
    .filter((d) => d <= to && [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()));
  return { week, from, to, label: `Week ${week} · ${weekend.length ? rangeLabel(weekend[0]!, weekend.at(-1)!) : rangeLabel(from, to)}` };
}
export type WeekWindow = ReturnType<typeof weekWindow>;

export function termWeekList(t: { startDate: string; endDate: string }): WeekWindow[] {
  const weeks = Math.floor(daysBetween(t.startDate, t.endDate) / 7) + 1;
  return Array.from({ length: weeks }, (_, i) => weekWindow(t, i + 1));
}
