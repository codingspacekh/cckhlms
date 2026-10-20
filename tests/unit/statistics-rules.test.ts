// FR-TCH-18: the class statistics behind the teacher's charts: attendance by week, the class's average by task
// and by week, how standings spread across score bands, and which syllabus topics need revisiting.
import { describe, expect, it } from 'vitest';
import { attendanceByWeek, mean, scoreBands, taskAverages, topicAverages, trendByWeek } from '@/modules/reporting/statistics-rules';

describe('mean', () => {
  it('averages what is there, to 1 decimal; nothing there is no average', () => {
    expect(mean([80, null, 65])).toBe(72.5);
    expect(mean([2, 2, 3])).toBe(2.3);
    expect(mean([null])).toBeNull();
    expect(mean([])).toBeNull();
  });
});

describe('attendance by week (BR-09, for the class)', () => {
  it('is present + late over everyone marked, less the excused, for each held week', () => {
    const weeks = [
      { week: 1, statuses: ['present', 'present', 'late', 'absent'] as const },
      { week: 2, statuses: ['present', 'excused', 'absent'] as const },
      { week: 3, statuses: [] as const }, // not taken yet
      { week: 4, statuses: ['excused'] as const }, // nobody expected
    ];
    expect(attendanceByWeek(weeks)).toEqual([
      { week: 1, percent: 75, expected: 4 },
      { week: 2, percent: 50, expected: 2 },
    ]);
  });
});

const work = [
  { id: 'a', title: 'Quiz 1', week: 1 },
  { id: 'b', title: 'Homework 1', week: 1 },
  { id: 'c', title: 'Homework 2', week: 2 },
  { id: 'd', title: 'Exam', week: 9 },
];
const students = [
  {
    tasks: [
      { id: 'a', percent: 80 },
      { id: 'b', percent: 60 },
      { id: 'c', percent: 0 },
      { id: 'd', percent: null },
    ],
  },
  {
    tasks: [
      { id: 'a', percent: 70 },
      { id: 'b', percent: null },
      { id: 'c', percent: 90 },
      { id: 'd', percent: null },
    ],
  },
];

describe('the class average by task', () => {
  it('averages the students it counts for; a task nobody has a score in is left out', () => {
    expect(taskAverages(work, students)).toEqual([
      { id: 'a', title: 'Quiz 1', week: 1, average: 75, counted: 2 },
      { id: 'b', title: 'Homework 1', week: 1, average: 60, counted: 1 },
      { id: 'c', title: 'Homework 2', week: 2, average: 45, counted: 2 },
    ]);
  });
});

describe('the score trend by week', () => {
  it('averages every counted score on work set that week', () => {
    // week 1: 80, 60, 70 → 70 · week 2: 0, 90 → 45 · week 9: nothing yet
    expect(trendByWeek(work, students)).toEqual([
      { week: 1, average: 70 },
      { week: 2, average: 45 },
    ]);
  });
});

describe('score bands', () => {
  it('counts current standings in bands of 10 from 50, leaving out students with no score yet', () => {
    expect(scoreBands([45, 59.9, 60, 72, 79.9, 85, 100, null])).toEqual([
      { label: 'Below 50', count: 1 },
      { label: '50–59', count: 1 },
      { label: '60–69', count: 1 },
      { label: '70–79', count: 2 },
      { label: '80–89', count: 1 },
      { label: '90–100', count: 1 },
    ]);
  });
});

describe('topics to revisit', () => {
  it('averages the scores on work linked to each topic, weakest first; topics with no scores are left out', () => {
    const links = [
      { taskId: 'a', topics: ['Output with print()', 'Variables'] },
      { taskId: 'b', topics: ['Variables'] },
      { taskId: 'c', topics: ['Loops'] },
      { taskId: 'd', topics: ['Functions'] },
    ];
    // Output: 80, 70 → 75 · Variables: 80, 60, 70 → 70 · Loops: 0, 90 → 45
    expect(topicAverages(links, students)).toEqual([
      { topic: 'Loops', average: 45, counted: 2 },
      { topic: 'Variables', average: 70, counted: 3 },
      { topic: 'Output with print()', average: 75, counted: 2 },
    ]);
  });
});
