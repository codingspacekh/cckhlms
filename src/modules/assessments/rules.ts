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
