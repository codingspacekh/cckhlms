// Class statistics that don't touch the database (FR-TCH-18): the numbers behind the teacher's charts. They start
// from each student's standing (standing.ts), so every chart agrees with the gradebook.
import { round1 } from '@/modules/assessments/rules';
import type { AttendanceStatus } from '@/modules/attendance/rules';

export function mean(values: (number | null)[]): number | null {
  const xs = values.filter((v): v is number => v !== null);
  return xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

// BR-09 for the whole class, week by week: (present + late) / (marked − excused). Weeks not taken yet, or where
// nobody was expected, are left out.
export function attendanceByWeek(weeks: { week: number; statuses: readonly AttendanceStatus[] }[]) {
  return weeks.flatMap(({ week, statuses }) => {
    const expected = statuses.filter((s) => s !== 'excused').length;
    if (!expected) return [];
    const came = statuses.filter((s) => s === 'present' || s === 'late').length;
    return [{ week, percent: round1((came / expected) * 100), expected }];
  });
}

type Work = { id: string; title: string; week: number | null };
type Students = { tasks: { id: string; percent: number | null }[] }[];

const scoresOn = (students: Students, ids: Set<string>) =>
  students.flatMap((s) => s.tasks.filter((t) => ids.has(t.id) && t.percent !== null).map((t) => t.percent!));

// The class's average on each piece of work, among the students it counts for (as in the overall score).
export function taskAverages(work: Work[], students: Students) {
  return work.flatMap((w) => {
    const scores = scoresOn(students, new Set([w.id]));
    return scores.length ? [{ id: w.id, title: w.title, week: w.week, average: mean(scores)!, counted: scores.length }] : [];
  });
}

// The average of every counted score on work set in each week.
export function trendByWeek(work: Work[], students: Students) {
  const weeks = [...new Set(work.map((w) => w.week).filter((w): w is number => w !== null))].sort((a, b) => a - b);
  return weeks.flatMap((week) => {
    const scores = scoresOn(students, new Set(work.filter((w) => w.week === week).map((w) => w.id)));
    return scores.length ? [{ week, average: mean(scores)! }] : [];
  });
}

const BANDS = [
  { label: 'Below 50', from: 0, to: 50 },
  { label: '50–59', from: 50, to: 60 },
  { label: '60–69', from: 60, to: 70 },
  { label: '70–79', from: 70, to: 80 },
  { label: '80–89', from: 80, to: 90 },
  { label: '90–100', from: 90, to: Infinity },
];

// How the class's current standings spread across score bands.
export const scoreBands = (scores: (number | null)[]) =>
  BANDS.map((b) => ({ label: b.label, count: scores.filter((s) => s !== null && s >= b.from && s < b.to).length }));

// The average score on work linked to each syllabus topic (from the lesson and the weekly report of the week it
// was set), weakest first.
export function topicAverages(links: { taskId: string; topics: string[] }[], students: Students) {
  const topics = [...new Set(links.flatMap((l) => l.topics))];
  return topics
    .flatMap((topic) => {
      const scores = scoresOn(students, new Set(links.filter((l) => l.topics.includes(topic)).map((l) => l.taskId)));
      return scores.length ? [{ topic, average: mean(scores)!, counted: scores.length }] : [];
    })
    .sort((a, b) => a.average - b.average || a.topic.localeCompare(b.topic));
}
