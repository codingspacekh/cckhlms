// The term puzzle on a student's "My week" (FR-STU-11, BR-21). It never affects scores, pass/fail or certificates:
// it only shows a child, week by week, that coming to class and finishing their work adds up.
import type { CellState } from '@/modules/assessments/rules';
import type { AttendanceStatus } from '@/modules/attendance/rules';

export type PieceState = 'earned' | 'away' | 'not_yet' | 'now' | 'coming' | 'joined';
export const PIECE_LABEL: Record<PieceState, string> = {
  earned: 'Done',
  away: 'Away',
  not_yet: 'Not yet',
  now: 'This week',
  coming: 'Coming up',
  joined: 'Joined later',
};

// Work that keeps a week's piece out: still missing after it was due, or sent back for a redo.
const OPEN: CellState[] = ['missing', 'returned'];

// `next` is the date of the class's next session, as the greeting shows it (null when none are left): that's
// This week, sessions after it are Coming up, and the ones before it are over.
export function termPuzzle(input: {
  sessions: { week: number | null; date: string; cancelled: boolean; status: AttendanceStatus | null }[];
  tasks: { week: number | null; state: CellState }[];
  enrolledOn: string;
  next: string | null;
}) {
  const held = input.sessions.filter((s) => !s.cancelled && s.week !== null).sort((a, b) => a.date.localeCompare(b.date));
  const pieces = held.map((s) => {
    const week = s.week!;
    let state: PieceState;
    if (s.date < input.enrolledOn) state = 'joined';
    else if (s.date === input.next) state = 'now';
    else if (input.next !== null && s.date > input.next) state = 'coming';
    else if (s.status === 'absent') state = 'away';
    else if (input.tasks.some((t) => t.week === week && OPEN.includes(t.state))) state = 'not_yet';
    else state = 'earned';
    return { week, date: s.date, state };
  });
  return {
    pieces,
    earned: pieces.filter((p) => p.state === 'earned').length,
    total: pieces.filter((p) => p.state !== 'joined').length,
  };
}
