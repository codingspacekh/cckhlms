// BR-12 · BR-13 · BR-14 · BR-17: the golden table for the overall score out of 100. Each case is worked out by
// hand (the sum under it) the way a spreadsheet would: points = score × (1 − penalty), each category = its
// points ÷ its maximum, overall = 60 % exam + 30 % classwork + 10 % homework with an empty category's weight
// shared out, then ROUND(…, 1), halves up. A case runs through the same steps as the gradebook: the cell's state
// (cellOf), what it adds (pointsOf), the overall (overallScore).
import { describe, expect, it } from 'vitest';
import { cellOf, overallScore, pointsOf, type Kind } from '@/modules/assessments/rules';

const tz = 'Asia/Phnom_Penh';
const due = new Date('2027-01-16T02:00:00Z'); // Sat 16 Jan 2027, 09:00 club time
const now = new Date('2027-01-17T00:00:00Z');

// A cell as the teacher would see it: 8 = marked on time, 'L8' = handed in late and marked 8, 'M' = missing,
// 'E' = excused by the teacher ('E8' even though it was marked), 'J' = joined the class after it was due,
// 'N' = not due yet, 'T' = handed in, not marked yet, 'R' = returned for a redo.
type Entry = number | `L${number}` | `E${number}` | 'M' | 'E' | 'J' | 'N' | 'T' | 'R';
type Row = [kind: Kind, maxScore: number, entry: Entry, latePenaltyPct?: number];

function points([, maxScore, entry, latePenaltyPct = 10]: Row) {
  let latest: { late: boolean; score: number | null; returnedAt: Date | null } | null = null;
  let excused = false;
  let enrolledOn = '2027-01-09';
  let at = now;
  if (typeof entry === 'number') latest = { late: false, score: entry, returnedAt: null };
  else if (entry.startsWith('L')) latest = { late: true, score: Number(entry.slice(1)), returnedAt: null };
  else if (entry.startsWith('E')) {
    excused = true;
    if (entry.length > 1) latest = { late: false, score: Number(entry.slice(1)), returnedAt: null };
  } else if (entry === 'J') enrolledOn = '2027-01-20';
  else if (entry === 'N') at = new Date('2027-01-15T00:00:00Z');
  else if (entry === 'T') latest = { late: false, score: null, returnedAt: null };
  else if (entry === 'R') latest = { late: false, score: 5, returnedAt: now };
  expect(maxScore).toBeGreaterThan(0);
  const cell = cellOf({ latest, excused, due, now: at, enrolledOn, tz });
  return pointsOf(cell, latest?.score ?? null, latePenaltyPct);
}

const standing = (rows: Row[]) => overallScore(rows.map((r) => ({ kind: r[0], maxScore: r[1], points: points(r) })));
type Expected = { overall: number | null; exam: number | null; classwork: number | null; homework: number | null };

const GOLDEN: [name: string, rows: Row[], expected: Expected][] = [
  // 0.6 × 90 + 0.3 × 85 + 0.1 × 70 = 54 + 25.5 + 7 = 86.5
  ['normal: all three categories', [['exam', 50, 45], ['classwork', 10, 8], ['classwork', 10, 9], ['homework', 10, 7]], { overall: 86.5, exam: 90, classwork: 85, homework: 70 }],
  // homework (8 + 0) / 20 = 40 → 48 + 21 + 4 = 73
  ['missing work counts as 0', [['exam', 50, 40], ['classwork', 10, 7], ['homework', 10, 8], ['homework', 10, 'M']], { overall: 73, exam: 80, classwork: 70, homework: 40 }],
  // the excused homework is left out: 8 / 10 = 80 → 48 + 21 + 8 = 77
  ['excused work is left out', [['exam', 50, 40], ['classwork', 10, 7], ['homework', 10, 8], ['homework', 10, 'E']], { overall: 77, exam: 80, classwork: 70, homework: 80 }],
  // excused wins over a mark already given
  ['excused even though it was marked', [['exam', 50, 40], ['classwork', 10, 7], ['homework', 10, 8], ['homework', 10, 'E2']], { overall: 77, exam: 80, classwork: 70, homework: 80 }],
  // late 8 − 10 % = 7.2 → 72 → 48 + 21 + 7.2 = 76.2
  ['late work loses the late penalty (BR-14)', [['exam', 50, 40], ['classwork', 10, 7], ['homework', 10, 'L8']], { overall: 76.2, exam: 80, classwork: 70, homework: 72 }],
  // a 0 % penalty: late 8 counts as 8 → 48 + 21 + 8 = 77
  ['late work with no penalty', [['exam', 50, 40], ['classwork', 10, 7], ['homework', 10, 'L8', 0]], { overall: 77, exam: 80, classwork: 70, homework: 80 }],
  // late classwork 10 − 25 % = 7.5 → 75 → 48 + 22.5 + 8 = 78.5
  ['late classwork with a 25 % penalty', [['exam', 50, 40], ['classwork', 10, 'L10', 25], ['homework', 10, 8]], { overall: 78.5, exam: 80, classwork: 75, homework: 80 }],
  // the homework due before they joined is left out: 9 / 10 = 90 → 48 + 21 + 9 = 78
  ['late enrolment: work due before joining is left out (BR-17)', [['exam', 50, 40], ['classwork', 10, 7], ['homework', 10, 'J'], ['homework', 10, 9]], { overall: 78, exam: 80, classwork: 70, homework: 90 }],
  // classwork 6 / 10 = 60, exam 70, homework 100 → 42 + 18 + 10 = 70
  ['late enrolment: most classwork was before joining', [['exam', 100, 70], ['classwork', 10, 'J'], ['classwork', 10, 'J'], ['classwork', 10, 6], ['homework', 10, 10]], { overall: 70, exam: 70, classwork: 60, homework: 100 }],
  // no exam yet: (30 × 0.7 + 10 × 0.9) / 40 = 30 / 40 = 75
  ['no exam yet: its weight is shared out', [['classwork', 10, 7], ['homework', 10, 9]], { overall: 75, exam: null, classwork: 70, homework: 90 }],
  // classwork only: 13 / 20 = 65
  ['classwork only', [['classwork', 10, 6], ['classwork', 10, 7]], { overall: 65, exam: null, classwork: 65, homework: null }],
  // the exam isn't marked yet, so it's left out: (24 + 6) / 40 = 75
  ['the exam is handed in but not marked yet', [['exam', 50, 'T'], ['classwork', 10, 8], ['homework', 10, 6]], { overall: 75, exam: null, classwork: 80, homework: 60 }],
  // the exam isn't due yet: as above
  ['the exam is not due yet', [['exam', 50, 'N'], ['classwork', 10, 8], ['homework', 10, 6]], { overall: 75, exam: null, classwork: 80, homework: 60 }],
  // two parts: (30 + 18) / (40 + 20) = 80 → 48 + 27 + 10 = 85
  ['multi-part exam: parts add up', [['exam', 40, 30], ['exam', 20, 18], ['classwork', 10, 9], ['homework', 10, 10]], { overall: 85, exam: 80, classwork: 90, homework: 100 }],
  // a missing part counts 0: 30 / 60 = 50 → 30 + 24 + 5 = 59, just under the pass mark
  ['multi-part exam with a part missing', [['exam', 40, 30], ['exam', 20, 'M'], ['classwork', 10, 8], ['homework', 10, 5]], { overall: 59, exam: 50, classwork: 80, homework: 50 }],
  // by points, not the average of the parts: (10 + 20) / (10 + 40) = 60, not (100 + 50) / 2 = 75 → 36 + 18 + 6 = 60
  ['multi-part exam weighs parts by their maximum', [['exam', 10, 10], ['exam', 40, 20], ['classwork', 10, 6], ['homework', 10, 6]], { overall: 60, exam: 60, classwork: 60, homework: 60 }],
  // only the marked part counts until the other is marked: 30 / 40 = 75 → 45 + 21 + 8 = 74
  ['multi-part exam with one part still to mark', [['exam', 40, 30], ['exam', 20, 'T'], ['classwork', 10, 7], ['homework', 10, 8]], { overall: 74, exam: 75, classwork: 70, homework: 80 }],
  // all homework excused: (48 + 21) / 90 = 76.666… → 76.7
  ['all-excused category: its weight is shared out', [['exam', 50, 40], ['classwork', 10, 7], ['homework', 10, 'E'], ['homework', 10, 'E']], { overall: 76.7, exam: 80, classwork: 70, homework: null }],
  // the exam excused: (21 + 9) / 40 = 75
  ['all-excused exam', [['exam', 50, 'E'], ['classwork', 10, 7], ['homework', 10, 9]], { overall: 75, exam: null, classwork: 70, homework: 90 }],
  ['everything excused: no score yet', [['exam', 50, 'E'], ['classwork', 10, 'E'], ['homework', 10, 'J']], { overall: null, exam: null, classwork: null, homework: null }],
  ['nothing due yet: no score yet', [['exam', 50, 'N'], ['classwork', 10, 'N'], ['homework', 10, 'N']], { overall: null, exam: null, classwork: null, homework: null }],
  // returned for a redo is left out until marked again: 8 / 10 → 48 + 21 + 8 = 77
  ['returned for a redo is left out', [['exam', 50, 40], ['classwork', 10, 7], ['homework', 10, 'R'], ['homework', 10, 8]], { overall: 77, exam: 80, classwork: 70, homework: 80 }],
  ['to mark is left out', [['exam', 50, 40], ['classwork', 10, 7], ['homework', 10, 'T'], ['homework', 10, 8]], { overall: 77, exam: 80, classwork: 70, homework: 80 }],
  ['everything missing', [['exam', 50, 'M'], ['classwork', 10, 'M'], ['homework', 10, 'M']], { overall: 0, exam: 0, classwork: 0, homework: 0 }],
  // 2 / 3 = 66.666… → 66.7
  ['rounding: a recurring decimal', [['classwork', 3, 2]], { overall: 66.7, exam: null, classwork: 66.7, homework: null }],
  // 1 / 3 = 33.333… → 33.3
  ['rounding: down', [['classwork', 3, 1]], { overall: 33.3, exam: null, classwork: 33.3, homework: null }],
  // late 6 − 15 % = 5.1; 5.1 / 8 = 63.75 exactly → 63.8 (halves go up, as in a spreadsheet)
  ['rounding: an exact half goes up', [['classwork', 8, 'L6', 15]], { overall: 63.8, exam: null, classwork: 63.8, homework: null }],
  // late 4.5 − 7 % = 4.185; 4.185 / 6 = 69.75 exactly → 69.8
  ['rounding: another exact half', [['homework', 6, 'L4.5', 7]], { overall: 69.8, exam: null, classwork: null, homework: 69.8 }],
  // late 9.5 − 7 % = 8.835 (not rounded to 8.84 first); 8.835 / 11 = 80.318… → 80.3
  ['the late penalty is not rounded before it counts', [['homework', 11, 'L9.5', 7]], { overall: 80.3, exam: null, classwork: null, homework: 80.3 }],
  // 0.6 × 59.5 + 0.3 × 60 + 0.1 × 60 = 35.7 + 18 + 6 = 59.7
  ['just under the pass mark', [['exam', 100, 59.5], ['classwork', 10, 6], ['homework', 20, 12]], { overall: 59.7, exam: 59.5, classwork: 60, homework: 60 }],
  // 35.7 + 18 + 0.1 × 62.5 = 59.95 → 60 (the rounded score is the one compared with the pass mark, BR-13)
  ['rounds up to the pass mark', [['exam', 100, 59.5], ['classwork', 10, 6], ['homework', 20, 12.5]], { overall: 60, exam: 59.5, classwork: 60, homework: 62.5 }],
];

describe('the overall score golden table (BR-12)', () => {
  it('has at least 25 cases', () => expect(GOLDEN.length).toBeGreaterThanOrEqual(25));
  it.each(GOLDEN)('%s', (_name, rows, expected) => {
    expect(standing(rows)).toEqual(expected);
  });
});
