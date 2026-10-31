// A student's own progress (FR-STU-07), without the database.
import { mean } from './statistics-rules';

// BR-11: students never see a classmate's score. An average of a few scores gives them away (with two students,
// yours and the average tell you theirs), so the class average is shown only from this many scores up.
export const MIN_FOR_CLASS_AVERAGE = 5;

// And only as a 10-point band (owner's choice, M17d, F09): an exact average read before and after one mark joins
// or leaves gives that mark away. 0–9 … 80–89, then 90–100.
export type ClassBand = { low: number; high: number };
export function classBand(scores: (number | null)[]): ClassBand | null {
  const xs = scores.filter((s): s is number => s !== null);
  if (xs.length < MIN_FOR_CLASS_AVERAGE) return null;
  const low = Math.min(90, Math.floor(xs.reduce((a, b) => a + b, 0) / xs.length / 10) * 10); // unrounded: 69.99 is 60–69
  return { low, high: low === 90 ? 100 : low + 9 };
}

// The most recent term before this one with a published report: the average of its final scores.
export function lastTerm(reports: { termId: string; termName: string; termStart: string; score: number }[], currentTermStart: string) {
  const earlier = reports.filter((r) => r.termStart < currentTermStart);
  if (!earlier.length) return null;
  const latest = earlier.reduce((a, b) => (b.termStart > a.termStart ? b : a));
  const inTerm = earlier.filter((r) => r.termId === latest.termId);
  return { termName: latest.termName, average: mean(inTerm.map((r) => r.score))!, classes: inTerm.length };
}
