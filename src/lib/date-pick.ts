// The date and time pickers (DateField, TimeField): what people can type, and the calendar they choose from.
// Dates are 'YYYY-MM-DD' and times 'HH:MM', the same values the browser's own date and time inputs sent.

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const pad = (n: number) => String(n).padStart(2, '0');

function isoDate(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (y < 1000 || t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// '2028-01-08', 'Sat 8 Jan 2028' (how the field shows a date), '8 January 2028', '8/1/2028' (day first).
export function parseDateText(text: string): string | null {
  const s = text.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return isoDate(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return isoDate(+m[3]!, +m[2]!, +m[1]!);
  m = /^(?:[a-z]+,?\s+)?(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})$/.exec(s);
  if (m) {
    const word = m[2]!;
    const month = MONTHS.findIndex((name) => word.length >= 3 && name.startsWith(word));
    return month < 0 ? null : isoDate(+m[3]!, month + 1, +m[1]!);
  }
  return null;
}

// '14:00', '9:30', '9.30', '930', '9', '2pm', '12:15 am'.
export function parseTimeText(text: string): string | null {
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?\s*(?:([ap])\.?m?\.?)?$/.exec(text.trim().toLowerCase());
  if (!m) return null;
  let h = +m[1]!;
  const min = m[2] ? +m[2] : 0;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === 'p' ? 12 : 0);
  }
  return h > 23 || min > 59 ? null : `${pad(h)}:${pad(min)}`;
}

// Six whole weeks from Monday (the club's Saturday and Sunday sit together at the end of each row).
export function monthDays(month: string): { date: string; inMonth: boolean }[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = first.getTime() - ((first.getUTCDay() + 6) % 7) * 86_400_000;
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    return { date, inMonth: date.startsWith(month) };
  });
}

// '2028-01' → 'January 2028'
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1]!.replace(/^./, (c) => c.toUpperCase())} ${y}`;
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const t = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}

export const TIME_STEPS = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// '2028-01-08' → 'Saturday 8 January 2028' (what a screen reader says for a day in the calendar)
export function dayLabel(date: string): string {
  const t = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[t.getUTCDay()]} ${t.getUTCDate()} ${monthTitle(date.slice(0, 7))}`;
}
