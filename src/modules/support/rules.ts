// Support lines' rules (FR-ADM-18, BR-29; M14c), without the database: what a support line holds, when it has
// started or ended in club time, and what its notification says.
import { z } from 'zod';
import { addMinutes, formatDate } from '@/modules/academics/schedule';

export const SUPPORT_MINUTES = [30, 45, 60, 90] as const;
export const SUPPORT_MESSAGE_MAX = 500;

const list = z.preprocess((v) => (v == null ? [] : Array.isArray(v) ? v : [v]), z.array(z.string()));
export const supportLineSchema = z.object({
  enrolmentIds: list
    .transform((ids) => [...new Set(ids.filter(Boolean))])
    .pipe(z.array(z.string()).min(1, 'Add at least one student.').max(40, 'A support line has at most 40 students.')),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a day.'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 18:00.'),
  minutes: z.coerce.number().refine((m) => (SUPPORT_MINUTES as readonly number[]).includes(m), 'Choose 30, 45, 60 or 90 minutes.'),
  // Checked with meetingLinkProblem (BR-28), so the message says what is wrong.
  meetingUrl: z.string().default(''),
  message: z.string().trim().max(SUPPORT_MESSAGE_MAX, `Keep the message under ${SUPPORT_MESSAGE_MAX} characters.`).default(''),
});
export type SupportLineInput = z.input<typeof supportLineSchema>;

type When = { date: string; startTime: string; minutes: number };
type ClubNow = { date: string; time: string };

// Minutes from a fixed day, so times past midnight still compare the right way.
const minutesAt = (date: string, time: string) => {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 60_000 + h * 60 + m;
};
export const hasStarted = (l: Omit<When, 'minutes'>, now: ClubNow) => minutesAt(l.date, l.startTime) <= minutesAt(now.date, now.time);
export const hasEnded = (l: When, now: ClubNow) => minutesAt(l.date, l.startTime) + l.minutes <= minutesAt(now.date, now.time);

const dayMonth = (date: string) => formatDate(date).replace(/ \d{4}$/, '');
// "Wed 21 Oct · 18:00–19:00"
export const supportWhen = (l: When) => `${dayMonth(l.date)} · ${l.startTime}–${addMinutes(l.startTime, l.minutes)}`;

// One notification per support line, worked out when read (ADR-08): new, changed or cancelled. A change or a
// cancellation gives it a new id, so it shows as unread again.
export function supportNotice(l: {
  id: string;
  date: string;
  startTime: string;
  createdAt: Date;
  updatedAt: Date;
  cancelledAt: Date | null;
}): { id: string; at: Date; title: string } {
  const when = `${dayMonth(l.date)} at ${l.startTime}`;
  const at = l.cancelledAt ?? l.updatedAt;
  const title = l.cancelledAt
    ? `Support line on ${when} is cancelled`
    : l.updatedAt > l.createdAt
      ? `Support line changed: now ${when}`
      : `Support line on ${when}`;
  return { id: `support:${l.id}:${at.getTime()}`, at, title };
}
