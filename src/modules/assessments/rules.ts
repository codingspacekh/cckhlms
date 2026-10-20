// Classwork, homework and exams (FR-TCH-07/08): their kinds and languages, and when they're due. A due time
// tied to a session is worked out from the sessions each time it's read, so moving or cancelling a session
// moves the work with it (BR-16) without a background job.
import { addMinutes, formatDate, toClubTime, zonedToUtc } from '@/modules/academics/schedule';

export const KINDS = ['classwork', 'homework', 'exam'] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = { classwork: 'Classwork', homework: 'Homework', exam: 'Exam' };

// 'paper' is work done on paper or in class: no editor, scores go straight into the gradebook.
export const WORK_LANGUAGES = ['python', 'java', 'web', 'paper'] as const;
export type WorkLanguage = (typeof WORK_LANGUAGES)[number];
export const WORK_LANGUAGE_LABEL: Record<WorkLanguage, string> = {
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

// BR-03/BR-04: until the due time a student can submit and resubmit (the latest counts). After it, a first
// submission is late if late work is accepted; work already handed in stays as it is.
export function canSubmit(a: {
  due: Date | null;
  now: Date;
  allowLate: boolean;
  submitted: boolean;
}): { ok: true; late: boolean } | { ok: false; reason: string } {
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
