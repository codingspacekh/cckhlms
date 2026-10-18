import { addMinutes, formatDate } from '@/modules/academics/schedule';

export const sessionWhen = (s: { date: string; startTime: string }, minutes: number) =>
  `${formatDate(s.date)} · ${s.startTime}–${addMinutes(s.startTime, minutes)}`;
