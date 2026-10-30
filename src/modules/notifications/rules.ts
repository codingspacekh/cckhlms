// Notification rules that don't touch the database (FR-STU-09, FR-SYS-01). Nothing is stored when something
// happens: each notification is worked out from lessons, work, marks and Q&A when it's read, so a scheduled lesson
// or "due soon" turns up on time without a background job (ADR-08).
import type { WorkLanguage } from '@/modules/assessments/rules';

export const DUE_SOON_HOURS = 48;
export const WINDOW_DAYS = 14;
const MAX_ITEMS = 50;
const HOUR = 3_600_000;
// Some times come from the database's clock and some from the app's; allow them to differ a little.
export const CLOCK_SLACK_MS = 60_000;

export type Area = 'student' | 'teacher';
export type NotificationKind =
  | 'lesson' // a new lesson to read
  | 'work' // new work set
  | 'due_soon' // work not handed in, due within DUE_SOON_HOURS
  | 'marked' // the teacher marked the student's work
  | 'returned' // the teacher sent it back for a redo
  | 'reply' // someone replied to the student's question
  | 'question' // a student asked a question in the teacher's class
  | 'report' // a post in the teacher's class was reported
  | 'to_mark' // hand-ins waiting to be marked
  | 'support_line'; // a support line the student (or a teacher's student) is in: made, changed or cancelled (M14c)
export type Notification = {
  id: string; // stable: the same thing gives the same id each time
  kind: NotificationKind;
  at: Date;
  title: string;
  detail: string;
  href: string;
  className: string;
};

// Students see a lesson from when it was published, or from its scheduled time if that's later.
export function lessonShownAt(l: { publishedAt: Date | null; publishAt: Date | null }): Date | null {
  if (!l.publishedAt) return null;
  return l.publishAt && l.publishAt > l.publishedAt ? l.publishAt : l.publishedAt;
}

type DueWork = { due: Date | null; language: WorkLanguage; handedIn: boolean; excused: boolean };
export const dueSoonAt = (w: { due: Date | null }) => (w.due ? new Date(w.due.getTime() - DUE_SOON_HOURS * HOUR) : null);

// Paper work is handed in on paper, so there's nothing to remind about in the LMS.
export function isDueSoon(w: DueWork, now: Date): boolean {
  if (!w.due || w.handedIn || w.excused || w.language === 'paper') return false;
  return dueSoonAt(w)!.getTime() <= now.getTime() && now.getTime() < w.due.getTime();
}

// The start of a question, on one line, to remind people which one it is.
export function snippet(text: string, max = 80): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export const windowStart = (now: Date) => new Date(now.getTime() - WINDOW_DAYS * 24 * HOUR);

// Newest first, nothing from the future (beyond the clock slack) or before the window, one of each, at most MAX_ITEMS.
export function sortFeed(items: Notification[], now: Date): Notification[] {
  const from = windowStart(now).getTime();
  const seen = new Set<string>();
  return items
    .filter((x) => x.at.getTime() >= from && x.at.getTime() <= now.getTime() + CLOCK_SLACK_MS)
    .sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id))
    .filter((x) => !seen.has(x.id) && !!seen.add(x.id))
    .slice(0, MAX_ITEMS);
}
