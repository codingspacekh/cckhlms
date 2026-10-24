// Words the home pages use (M8): when the next class is, and how to greet someone.
import { DAY_NAME, addDays, formatDate, weekdayOf } from '@/modules/academics/schedule';

const LONG_DAY: Record<string, string> = { ...DAY_NAME, mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday' };
const clock = (time: string) => time.replace(/^0(\d)/, '$1');

// "today at 9:00", "tomorrow at 9:00", "on Saturday at 9:00" within the week ahead, else the date.
export function classWhen(s: { date: string; startTime: string }, today: string): string {
  const at = `at ${clock(s.startTime)}`;
  if (s.date === today) return `today ${at}`;
  if (s.date === addDays(today, 1)) return `tomorrow ${at}`;
  if (s.date < addDays(today, 7)) return `on ${LONG_DAY[weekdayOf(s.date)]} ${at}`;
  return `on ${formatDate(s.date)} ${at}`;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

// "Good morning" before noon, "Good afternoon" until 5 pm, else "Good evening" (an hour on the club's clock).
export const greeting = (hour: number) =>
  hour >= 5 && hour < 12 ? 'Good morning' : hour >= 12 && hour < 17 ? 'Good afternoon' : 'Good evening';
