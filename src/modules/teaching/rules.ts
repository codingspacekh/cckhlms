// Teaching rules that don't touch the database (FR-TCH-02, ADR-08, BR-19).
import { addMinutes, zonedToUtc } from '@/modules/academics/schedule';

export type LessonStatus = 'draft' | 'published';
export type LessonState = 'draft' | 'scheduled' | 'published';

// Worked out when read, so a scheduled lesson appears on time without a background job (ADR-08).
export function lessonState(l: { status: LessonStatus; publishAt: Date | null }, now: Date): LessonState {
  if (l.status === 'draft') return 'draft';
  return l.publishAt && l.publishAt.getTime() > now.getTime() ? 'scheduled' : 'published';
}

// A publish time typed in club time (BR-19).
export const publishAtFor = (date: string, time: string, tz: string) => zonedToUtc(date, time, tz);

// The suggested reveal time for a scheduled lesson: when the session ends.
export const sessionEnd = (s: { date: string; startTime: string; minutes: number }) => ({
  date: s.date,
  time: addMinutes(s.startTime, s.minutes),
});
