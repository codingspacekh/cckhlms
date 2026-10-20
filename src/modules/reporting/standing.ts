// Each student's current standing in a class (FR-TCH-17, FR-ADM-09, FR-STU-07): the overall score out of 100 with
// its three parts (BR-12), the result it suggests (BR-13), attendance (BR-09) and homework handed in. It reads the
// gradebook's marks and the attendance rows, so every screen shows the same numbers, worked out when read.
import { classAccess } from '@/modules/academics/access';
import { loadGradebook, type GradebookRow, type GradebookWork, type Overall } from '@/modules/assessments/gradebook';
import type { CellState } from '@/modules/assessments/rules';
import { attendanceRates } from '@/modules/attendance/attendance';
import type { Actor } from '@/server/actor';
import { assertCan } from '@/server/errors';
import { homeworkCompletion, suggestedResult, taskPercent, type Result } from './rules';

type Opts = { now?: Date };

export type TaskStanding = Pick<GradebookWork, 'id' | 'title' | 'kind' | 'week' | 'maxScore'> & {
  state: CellState;
  late: boolean;
  percent: number | null; // as it counts in the overall score
};
export type StudentStanding = {
  studentId: string;
  enrolmentId: string;
  name: string;
  enrolledOn: string;
  overall: Overall;
  suggested: Result | null;
  attendance: { percent: number | null; present: number; late: number; absent: number; excused: number; held: number };
  homework: ReturnType<typeof homeworkCompletion>;
  tasks: TaskStanding[];
};
export type ClassStandings = { classId: string; className: string; passMark: number; work: GradebookWork[]; students: StudentStanding[] };

const noAttendance = { percent: null, present: 0, late: 0, absent: 0, excused: 0, held: 0 };

async function load(classId: string, opts: Opts & { studentId?: string }): Promise<ClassStandings> {
  const [book, rates] = await Promise.all([loadGradebook(classId, opts), attendanceRates(classId)]);
  const standingOf = (r: GradebookRow): StudentStanding => {
    const tasks = book.work.map((w) => {
      const c = r.cells[w.id]!;
      return {
        id: w.id,
        title: w.title,
        kind: w.kind,
        week: w.week,
        maxScore: w.maxScore,
        state: c.state,
        late: c.late,
        percent: taskPercent({ points: c.points, maxScore: w.maxScore }),
      };
    });
    const rate = rates.get(r.enrolmentId);
    return {
      studentId: r.id,
      enrolmentId: r.enrolmentId,
      name: r.name,
      enrolledOn: r.enrolledOn,
      overall: r.overall,
      suggested: suggestedResult(r.overall.overall, book.passMark),
      attendance: rate ? { ...rate, percent: rate.percent === null ? null : Math.round(rate.percent) } : noAttendance,
      homework: homeworkCompletion(tasks),
      tasks,
    };
  };
  return { classId, className: book.className, passMark: book.passMark, work: book.work, students: book.rows.map(standingOf) };
}

// The whole class: for its teachers and Admin.
export async function classStandings(actor: Actor | null, classId: string, opts: Opts = {}): Promise<ClassStandings> {
  assertCan(actor, 'class.view', await classAccess(classId));
  return load(classId, opts);
}

// A student's own standing in a class they're in now, and nobody else's (BR-11).
export async function myClassStanding(actor: Actor | null, classId: string, opts: Opts = {}): Promise<StudentStanding | null> {
  assertCan(actor, 'work.submit', await classAccess(classId));
  return (await load(classId, { ...opts, studentId: actor.userId })).students[0] ?? null;
}
