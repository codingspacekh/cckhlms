// Weekly sessions, club time and clashes (BR-15, BR-19, FR-ADM-05/08, FR-TCH-05).
// Dates are calendar dates ('2027-01-09') and times are wall-clock times ('09:00') in the club's time zone.
// Only zonedToUtc() turns them into an instant, so nothing depends on the server's own time zone.

export type Day = 'sat' | 'sun';
export const DAY_NAME: Record<Day, string> = { sat: 'Saturday', sun: 'Sunday' };
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const toUtcMidnight = (date: string) => new Date(`${date}T00:00:00Z`);
export const addDays = (date: string, days: number) =>
  new Date(toUtcMidnight(date).getTime() + days * 86_400_000).toISOString().slice(0, 10);
export const weekdayOf = (date: string) => WEEKDAYS[toUtcMidnight(date).getUTCDay()]!;

export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export const scheduleLabel = (c: { day: Day; startTime: string; minutes: number; weeks: number }) =>
  `${DAY_NAME[c.day]} ${c.startTime}–${addMinutes(c.startTime, c.minutes)} · ${c.weeks} weeks`;

export type PlannedSession = { date: string; week: number | null; cancelled: boolean };

// One session every 7 days from firstDate. A cancelled date doesn't count as a week, so the class gets
// an extra week at the end and still has `weeks` sessions.
export function generateSessions(input: { firstDate: string; weeks: number; cancelledDates: string[] }): PlannedSession[] {
  const cancelled = new Set(input.cancelledDates);
  const out: PlannedSession[] = [];
  let week = 0;
  for (let i = 0; week < input.weeks && i < input.weeks + 52; i++) {
    const date = addDays(input.firstDate, 7 * i);
    if (cancelled.has(date)) out.push({ date, week: null, cancelled: true });
    else out.push({ date, week: ++week, cancelled: false });
  }
  return out;
}

// Week n = the n-th session that isn't cancelled, by date. A make-up session therefore takes the place
// of the week it falls in (BR-15).
export function numberWeeks(rows: { id: string; date: string; cancelled: boolean }[]): Map<string, number | null> {
  const result = new Map<string, number | null>();
  let week = 0;
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) result.set(r.id, r.cancelled ? null : ++week);
  return result;
}

// Offset of `tz` from UTC at a given instant, in minutes.
function offsetMinutes(at: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

// The instant when a club-time date and time happens (BR-19).
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let utc = naive - offsetMinutes(new Date(naive), tz) * 60_000;
  utc = naive - offsetMinutes(new Date(utc), tz) * 60_000; // second pass settles daylight-saving edges
  return new Date(utc);
}

export function nextSession<T extends { date: string; startTime: string; cancelled: boolean }>(
  sessions: T[],
  now: Date,
  tz: string,
): T | null {
  return (
    [...sessions]
      .filter((s) => !s.cancelled && zonedToUtc(s.date, s.startTime, tz).getTime() > now.getTime())
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0] ?? null
  );
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number) as [number, number];
  return h * 60 + m;
};
export function overlaps(a: { start: string; minutes: number }, b: { start: string; minutes: number }): boolean {
  const a0 = toMinutes(a.start);
  const b0 = toMinutes(b.start);
  return a0 < b0 + b.minutes && b0 < a0 + a.minutes;
}

// Dates in words, built by hand: toLocaleDateString differs between environments (ICU data adds or drops
// commas), and these strings must read the same in Node, every browser and the tests.
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// '22 Jan 2028'
export const formatDay = (date: string) => {
  const d = toUtcMidnight(date);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
// '22 Jan' (where the year is obvious, e.g. posts inside a class)
export const formatDayMonth = (date: string) => formatDay(date).replace(/ \d+$/, '');
// 'Sat 22 Jan 2028'
export const formatDate = (date: string) => `${WD[toUtcMidnight(date).getUTCDay()]} ${formatDay(date)}`;

// Today's date in the club's time zone (BR-19), e.g. the default join date for an enrolment.
export function todayIn(tz: string, now: Date = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

// An instant as a club date and time, e.g. to show when a scheduled lesson appears (BR-19).
export function toClubTime(at: Date, tz: string): { date: string; time: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return { date: todayIn(tz, at), time: `${p.hour}:${p.minute}` };
}
