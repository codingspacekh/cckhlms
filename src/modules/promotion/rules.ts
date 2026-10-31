// Promotion's checks without the database (M15a, FR-ADM-13, BR-30): how full each new class will be, and which
// students would be in two classes at the same time. They warn and never block a promotion.
import { formatDate, overlaps, todayIn, type Day } from '@/modules/academics/schedule';

export type Places = { taken: number; capacity: number | null; over: number };

export function placesAfter(c: { enrolled: number; capacity: number | null }, incoming: number): Places {
  const taken = c.enrolled + incoming;
  return { taken, capacity: c.capacity, over: c.capacity === null ? 0 : Math.max(0, taken - c.capacity) };
}

export const placesText = (p: Places) =>
  p.capacity === null ? `${p.taken} ${p.taken === 1 ? 'student' : 'students'} after this` : `${p.taken} of ${p.capacity} places after this`;

// A class a student is in, or could be sent to.
export type Slot = { classId: string; termId: string; name: string; day: Day; startTime: string; minutes: number };

// The other classes, in the target's term, that meet on the same day at an overlapping time.
export const clashesFor = (target: Slot, busy: Slot[]) =>
  busy.filter(
    (b) =>
      b.classId !== target.classId &&
      b.termId === target.termId &&
      b.day === target.day &&
      overlaps({ start: b.startTime, minutes: b.minutes }, { start: target.startTime, minutes: target.minutes }),
  );

export type Promoted = { at: Date; by: string | null; moved: number; left: number };

// "Promoted on Sat 31 Oct 2026 by Club Admin: 9 moved on, 1 left the club."
export function promotedText(p: Promoted, timeZone: string) {
  const what = [p.moved ? `${p.moved} moved on` : '', p.left ? `${p.left} left the club` : ''].filter(Boolean).join(', ');
  return `Promoted on ${formatDate(todayIn(timeZone, p.at))}${p.by ? ` by ${p.by}` : ''}: ${what || 'nobody was in it'}.`;
}
