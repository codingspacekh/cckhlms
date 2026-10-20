// Report numbers that don't touch the database (FR-ADM-09, FR-STU-07, FR-TCH-18). The overall score itself is
// BR-12 in assessments/rules.ts, so the gradebook and every report use one calculation.
import { round1, type CellState, type Kind } from '@/modules/assessments/rules';

// Homework handed in ÷ homework that was due (§5.3 of the architecture). Not due yet, excused, and due before the
// student joined (BR-17) are left out; homework handed in before it was due counts.
export function homeworkCompletion(cells: { kind: Kind; state: CellState }[]) {
  const expected = cells.filter((c) => c.kind === 'homework' && c.state !== 'not_due' && c.state !== 'excused');
  const handedIn = expected.filter((c) => c.state !== 'missing').length;
  return { handedIn, expected: expected.length, percent: expected.length ? Math.round((handedIn / expected.length) * 100) : null };
}

// One task as a percentage of its maximum, as it counts in the overall score (late penalty off, missing = 0).
export const taskPercent = (t: { points: number | null; maxScore: number }) =>
  t.points === null ? null : round1((t.points / t.maxScore) * 100);

export type Result = 'pass' | 'fail';

// BR-13: what the overall score suggests; the teacher confirms it.
export const suggestedResult = (overall: number | null, passMark: number): Result | null =>
  overall === null ? null : overall >= passMark ? 'pass' : 'fail';
