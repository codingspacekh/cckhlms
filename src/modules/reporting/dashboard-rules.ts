// Admin report and dashboard numbers that don't touch the database (FR-ADM-09/10, BR-10).
import { round1 } from '@/modules/assessments/rules';
import { addDays } from '@/modules/academics/schedule';
import { mean } from './statistics-rules';

// BR-10: the average of the latest scores minus the average of the ones just before, in points. Up to 4 on each
// side; with fewer than 8 scores the windows shrink to half of what there is. Scores are in the order they were due.
export function improvement(scores: number[]): { change: number; window: number } | null {
  const window = Math.min(4, Math.floor(scores.length / 2));
  if (window < 1) return null;
  const last = scores.slice(-window);
  const before = scores.slice(-2 * window, -window);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { change: round1(avg(last) - avg(before)), window };
}

// The weekend a dashboard looks at: this one on Saturday or Sunday, otherwise the coming one (club dates).
export function weekendOf(today: string): [string, string] {
  const day = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 Sunday … 6 Saturday
  const saturday = day === 0 ? addDays(today, -1) : addDays(today, 6 - day);
  return [saturday, addDays(saturday, 1)];
}

// Low attendance for the dashboard's alerts: under 75 %, once there are at least 2 sessions to go on.
export const LOW_ATTENDANCE = 75;
export const isLowAttendance = (a: { percent: number | null; held: number }) =>
  a.percent !== null && a.held >= 2 && a.percent < LOW_ATTENDANCE;

// BR-10, term over term: each published final score against the one from the term before (several classes in a
// term are averaged).
export function termChanges(reports: { termName: string; termStart: string; score: number }[]) {
  const terms = [...new Set(reports.map((r) => r.termStart))].sort();
  let previous: number | null = null;
  return terms.map((start) => {
    const inTerm = reports.filter((r) => r.termStart === start);
    const score = mean(inTerm.map((r) => r.score))!;
    const change = previous === null ? null : round1(score - previous);
    previous = score;
    return { termName: inTerm[0]!.termName, score, change };
  });
}
