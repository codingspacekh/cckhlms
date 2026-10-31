// Classwork, homework and exams (FR-TCH-07/08): their kinds and languages, and when they're due. A due time
// tied to a session is worked out from the sessions each time it's read, so moving or cancelling a session
// moves the work with it (BR-16) without a background job.
import { addMinutes, formatDate, toClubTime, zonedToUtc } from '@/modules/academics/schedule';
import { ValidationError } from '@/server/errors';

export const KINDS = ['classwork', 'homework', 'exam'] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = { classwork: 'Classwork', homework: 'Homework', exam: 'Exam' };

// A language's id (src/modules/academics/language-rules.ts, M18): the built-in ones, 'paper' (work done on paper or in
// class: no editor, scores go straight into the gradebook), or one Admin added (handed in as a file or a link).
export type WorkLanguage = string;
// The built-in ones' names, for code that has no database at hand (the Playground's own list).
export const WORK_LANGUAGE_LABEL: Record<string, string> = {
  python: 'Python',
  java: 'Java',
  web: 'HTML/CSS/JS',
  paper: 'Paper / in class',
};

export const DUE_MODES = ['next_session', 'session_end', 'fixed'] as const;
export type DueMode = (typeof DUE_MODES)[number];

type SessionLike = { id: string; date: string; startTime: string; minutes: number; cancelled: boolean };

// The first session after `fromId` (sessions in date order) that is held.
export function nextHeldSession<T extends SessionLike>(sessions: T[], fromId: string): T | null {
  const i = sessions.findIndex((s) => s.id === fromId);
  if (i < 0) return null;
  return sessions.slice(i + 1).find((s) => !s.cancelled) ?? null;
}

const sessionEnd = (s: SessionLike, tz: string) => zonedToUtc(s.date, addMinutes(s.startTime, s.minutes), tz);

export function resolveDue(
  a: { sessionId: string; dueMode: DueMode; dueAt: Date | null },
  sessions: SessionLike[],
  tz: string,
): Date | null {
  if (a.dueMode === 'fixed') return a.dueAt;
  const set = sessions.find((s) => s.id === a.sessionId);
  if (!set) return null;
  if (a.dueMode === 'session_end') return sessionEnd(set, tz);
  const next = nextHeldSession(sessions, a.sessionId);
  return next ? zonedToUtc(next.date, next.startTime, tz) : sessionEnd(set, tz);
}

export const defaultDueMode = (kind: Kind): DueMode => (kind === 'homework' ? 'next_session' : 'session_end');

// The "Due" options for work set in a session, with their dates in words.
export function dueChoices(sessions: SessionLike[], sessionId: string): { mode: DueMode; label: string }[] {
  const set = sessions.find((s) => s.id === sessionId);
  const next = nextHeldSession(sessions, sessionId);
  const choices: { mode: DueMode; label: string }[] = [];
  if (next) choices.push({ mode: 'next_session', label: `Start of the next session (${formatDate(next.date)}, ${next.startTime})` });
  if (set)
    choices.push({
      mode: 'session_end',
      label: `End of this session (${formatDate(set.date)}, ${addMinutes(set.startTime, set.minutes)})`,
    });
  choices.push({ mode: 'fixed', label: 'Another day and time' });
  return choices;
}

// 'Sat 16 Jan 2027, 09:00' in club time (BR-19).
export function formatDue(due: Date | null, tz: string): string {
  if (!due) return 'No due date';
  const t = toClubTime(due, tz);
  return `${formatDate(t.date)}, ${t.time}`;
}

// The project a student starts from when the teacher hasn't saved starter files (FR-CODE-06).
export function defaultStarter(language: WorkLanguage): { path: string; content: string }[] {
  if (language === 'python') return [{ path: 'main.py', content: '# Write your program here\n' }];
  if (language === 'java')
    return [
      {
        path: 'src/Main.java',
        content: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello!");\n    }\n}\n',
      },
    ];
  if (language === 'web')
    return [
      {
        path: 'index.html',
        content:
          '<!doctype html>\n<html>\n  <head>\n    <meta charset="utf-8">\n    <title>My page</title>\n    <link rel="stylesheet" href="style.css">\n  </head>\n  <body>\n    <h1>Hello!</h1>\n    <script src="script.js"></script>\n  </body>\n</html>\n',
      },
      { path: 'script.js', content: 'console.log("Hello from script.js");\n' },
      { path: 'style.css', content: 'body {\n  font-family: sans-serif;\n}\n' },
    ];
  return [];
}

// 'countdown-to-lift-off-bopha.l': the name of a downloaded project, without .zip.
export function zipNameFor(title: string, username?: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'project';
  return username ? `${slug}-${username}` : slug;
}

// At most this many hand-ins of one piece of work per student (M17b, F04): each keeps a full copy of the project.
export const MAX_HAND_INS = 20;

// BR-03/BR-04: until the due time a student can submit and resubmit (the latest counts). After it, a first
// submission is late if late work is accepted; work already handed in stays as it is.
export function canSubmit(a: {
  due: Date | null;
  now: Date;
  allowLate: boolean;
  submitted: boolean;
  mark?: Mark | null; // the latest version's
  lastLate?: boolean;
  handIns?: number; // the student's hand-ins so far (marks entered in the gradebook aren't hand-ins)
}): { ok: true; late: boolean } | { ok: false; reason: string } {
  if (a.mark === 'graded') return { ok: false, reason: 'Your teacher has marked this, so it can’t be changed.' };
  if ((a.handIns ?? 0) >= MAX_HAND_INS)
    return { ok: false, reason: `You’ve handed this in ${MAX_HAND_INS} times, the most for one piece of work.` };
  // Returned for a redo (FR-TCH-12): the student may hand it in again, even after the due time.
  if (a.mark === 'returned') return { ok: true, late: !!a.lastLate };
  if (!a.due || a.now.getTime() <= a.due.getTime()) return { ok: true, late: false };
  if (a.submitted) return { ok: false, reason: 'The due time has passed, so your submission can’t be changed.' };
  if (!a.allowLate) return { ok: false, reason: 'The due time has passed and late work isn’t accepted for this.' };
  return { ok: true, late: true };
}

export type WorkStatus = 'submitted' | 'late' | 'missing' | 'not_due' | 'excused';
export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  submitted: 'Submitted',
  late: 'Late',
  missing: 'Missing',
  not_due: 'Not due yet',
  excused: 'Joined after it was due',
};

// A student's status on one piece of work, worked out when read: "missing" is never stored (ADR-08). A
// student who joined after the due date isn't expected to have done it (BR-17).
export function workStatus(a: {
  latest: { late: boolean } | null;
  due: Date | null;
  now: Date;
  enrolledOn: string;
  tz: string;
}): WorkStatus {
  if (a.latest) return a.latest.late ? 'late' : 'submitted';
  if (!a.due) return 'not_due';
  if (a.enrolledOn > toClubTime(a.due, a.tz).date) return 'excused';
  return a.now.getTime() > a.due.getTime() ? 'missing' : 'not_due';
}

// FR-TCH-11/12 · BR-04: marking is done on the latest version. It's waiting to be marked, marked, or
// returned for a redo.
export type Mark = 'to_mark' | 'graded' | 'returned';
export const MARK_LABEL: Record<Mark, string> = { to_mark: 'To mark', graded: 'Marked', returned: 'Returned for redo' };

export function markOf(latest: { score: string | number | null; returnedAt: Date | null } | null): Mark | null {
  if (!latest) return null;
  if (latest.returnedAt) return 'returned';
  return latest.score === null ? 'to_mark' : 'graded';
}

// A score typed by the teacher: 0 to the maximum, in steps of 0.5.
export function checkScore(raw: string, maxScore: number): number {
  const text = raw.trim();
  const n = /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
  if (!(n >= 0 && n <= maxScore && Number.isInteger(n * 2)))
    throw new ValidationError(`Enter a score from 0 to ${maxScore}, in steps of 0.5.`);
  return n;
}

// BR-14: late work counts with the late penalty taken off. Not rounded: scores go in 0.5 steps and the penalty
// is a whole percent, so this is exact to 3 decimals (9.5 − 7 % = 8.835), as in a spreadsheet.
export function afterPenalty(score: number, a: { late: boolean; latePenaltyPct: number }): number {
  if (!a.late || a.latePenaltyPct <= 0) return score;
  return Math.round(score * (100 - a.latePenaltyPct) * 10) / 1000;
}

// FR-TCH-19: one gradebook cell, worked out when read like "missing" (ADR-08). Excused (by the teacher, or
// joined after it was due, BR-17) wins over everything else.
export type CellState = 'graded' | 'to_mark' | 'returned' | 'missing' | 'not_due' | 'excused';
export const CELL_LABEL: Record<CellState, string> = {
  graded: 'Marked',
  to_mark: 'To mark',
  returned: 'Returned',
  missing: 'Missing',
  not_due: 'Not due yet',
  excused: 'Excused',
};

export function cellOf(a: {
  latest: { late: boolean; score: number | null; returnedAt: Date | null } | null;
  excused: boolean;
  due: Date | null;
  now: Date;
  enrolledOn: string;
  tz: string;
}): { state: CellState; late: boolean } {
  const late = a.latest?.late ?? false;
  if (a.excused) return { state: 'excused', late };
  const mark = markOf(a.latest);
  if (mark) return { state: mark, late };
  const status = workStatus({ latest: null, due: a.due, now: a.now, enrolledOn: a.enrolledOn, tz: a.tz });
  return { state: status === 'excused' ? 'excused' : status === 'missing' ? 'missing' : 'not_due', late };
}

// What a cell adds to the overall score (BR-12): the mark after any late penalty (BR-14); missing work is 0;
// anything not marked yet, or excused, is left out.
export function pointsOf(cell: { state: CellState; late: boolean }, score: number | null, latePenaltyPct: number): number | null {
  if (cell.state === 'missing') return 0;
  if (cell.state !== 'graded' || score === null) return null;
  return afterPenalty(score, { late: cell.late, latePenaltyPct });
}

// What the teacher typed in a gradebook cell.
export function parseCell(raw: string, maxScore: number): { kind: 'score'; score: number } | { kind: 'excuse' } | { kind: 'clear' } {
  const text = raw.trim();
  if (!text) return { kind: 'clear' };
  if (text.toLowerCase() === 'ex') return { kind: 'excuse' };
  try {
    return { kind: 'score', score: checkScore(text, maxScore) };
  } catch {
    throw new ValidationError(`Enter a score from 0 to ${maxScore}, in steps of 0.5, or ex to excuse.`);
  }
}

// BR-12: overall out of 100 = 60 × exam + 30 × classwork + 10 × homework, each as total points over total
// maximum of the work that counts. A category with nothing counted shares its weight among the others.
export const KIND_WEIGHT: Record<Kind, number> = { exam: 60, classwork: 30, homework: 10 };
// To 1 decimal, halves up, like a spreadsheet's ROUND. The sums can land a hair under a half (63.75 comes out
// as 63.7499…), so the float noise is cleared to 9 significant figures first.
export const round1 = (n: number) => Math.round(Number((n * 10).toPrecision(9))) / 10;

export function overallScore(items: { kind: Kind; maxScore: number; points: number | null }[]): {
  overall: number | null;
} & Record<Kind, number | null> {
  const pct = {} as Record<Kind, number | null>;
  let sum = 0;
  let weights = 0;
  for (const kind of KINDS) {
    const counted = items.filter((i) => i.kind === kind && i.points !== null);
    const max = counted.reduce((n, i) => n + i.maxScore, 0);
    if (!max) {
      pct[kind] = null;
      continue;
    }
    const fraction = counted.reduce((n, i) => n + i.points!, 0) / max;
    pct[kind] = round1(fraction * 100);
    sum += KIND_WEIGHT[kind] * fraction;
    weights += KIND_WEIGHT[kind];
  }
  return { overall: weights ? round1((sum / weights) * 100) : null, ...pct };
}
