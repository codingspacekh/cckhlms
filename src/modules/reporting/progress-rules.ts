// A student's own progress (FR-STU-07), without the database.
import { mean } from './statistics-rules';

// BR-11: students never see a classmate's score. An average of a few scores gives them away (with two students,
// yours and the average tell you theirs), so the class average is shown only from this many scores up.
export const MIN_FOR_CLASS_AVERAGE = 5;

export function classAverage(scores: (number | null)[]): number | null {
  return scores.filter((s) => s !== null).length >= MIN_FOR_CLASS_AVERAGE ? mean(scores) : null;
}

// The most recent term before this one with a published report: the average of its final scores.
export function lastTerm(reports: { termId: string; termName: string; termStart: string; score: number }[], currentTermStart: string) {
  const earlier = reports.filter((r) => r.termStart < currentTermStart);
  if (!earlier.length) return null;
  const latest = earlier.reduce((a, b) => (b.termStart > a.termStart ? b : a));
  const inTerm = earlier.filter((r) => r.termId === latest.termId);
  return { termName: latest.termName, average: mean(inTerm.map((r) => r.score))!, classes: inTerm.length };
}
