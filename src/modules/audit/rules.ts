// The audit log viewer (FR-SYS-02): a name and a group for every action the LMS records (NFR-11), the filters
// Admin can use, and each entry's details as lines a person can read. tests/unit/audit-rules.test.ts reads the
// source, so an action can't be recorded without a name here.
import { formatDate } from '@/modules/academics/schedule';
import { RATING_LABEL, RESULT_LABEL, type Rating } from '@/modules/reporting/term-report-rules';

export const AUDIT_GROUPS = {
  accounts: 'Accounts and passwords',
  marks: 'Marks and hand-ins',
  results: 'Term reports and results',
  promotion: 'Promotion',
  certificates: 'Certificates',
  classes: 'Terms, courses and classes',
  teaching: 'Lessons, work and Q&A',
  settings: 'Settings',
  signins: 'Sign-ins',
} as const;
export type AuditGroup = keyof typeof AUDIT_GROUPS;
// FR-SYS-02's sensitive actions: account changes, password resets, grade changes, pass/fail changes, promotions,
// certificate issues.
export const SENSITIVE_GROUPS: AuditGroup[] = ['accounts', 'marks', 'results', 'promotion', 'certificates'];
export const EVERYDAY_GROUPS: AuditGroup[] = ['classes', 'teaching', 'settings', 'signins'];

export const AUDIT_ACTIONS: Record<string, { label: string; group: AuditGroup }> = {
  'account.create': { label: 'Created an account', group: 'accounts' },
  'account.password_reset': { label: 'Reset a password', group: 'accounts' },
  'account.deactivate': { label: 'Switched off an account', group: 'accounts' },
  'account.reactivate': { label: 'Switched an account back on', group: 'accounts' },
  'account.sign_out_everywhere': { label: 'Signed someone out everywhere', group: 'accounts' },
  'student.export': { label: 'Downloaded a student’s data', group: 'accounts' },
  'student.erase': { label: 'Deleted a student’s personal data', group: 'accounts' },
  'submission.submit': { label: 'Handed in work', group: 'marks' },
  'submission.grade': { label: 'Marked work', group: 'marks' },
  'submission.return': { label: 'Sent work back for a redo', group: 'marks' },
  'gradebook.cell': { label: 'Changed a score in the gradebook', group: 'marks' },
  'gradebook.comment': { label: 'Changed a comment in the gradebook', group: 'marks' },
  'termreport.override': { label: 'Chose a different score or result', group: 'results' },
  'termreport.publish': { label: 'Published a term report', group: 'results' },
  'termreport.amend': { label: 'Changed a published term report', group: 'results' },
  'class.promote': { label: 'Promoted a class', group: 'promotion' },
  'certificate.issue': { label: 'Issued a certificate', group: 'certificates' },
  'certificate.reissue': { label: 'Reissued a certificate', group: 'certificates' },
  'certificate.revoke': { label: 'Revoked a certificate', group: 'certificates' },
  'term.create': { label: 'Added a term', group: 'classes' },
  'term.status': { label: 'Changed a term’s status', group: 'classes' },
  'term.update': { label: 'Changed a term', group: 'classes' },
  'term.delete': { label: 'Deleted a term', group: 'classes' },
  'course.create': { label: 'Added a course', group: 'classes' },
  'course.update': { label: 'Changed a course', group: 'classes' },
  'course.delete': { label: 'Deleted a course', group: 'classes' },
  'course.syllabus': { label: 'Changed a syllabus', group: 'classes' },
  'class.create': { label: 'Added a class', group: 'classes' },
  'class.update': { label: 'Changed a class', group: 'classes' },
  'class.delete': { label: 'Deleted a class', group: 'classes' },
  'class.archive': { label: 'Archived a class', group: 'classes' },
  'class.unarchive': { label: 'Reopened a class', group: 'classes' },
  'session.add': { label: 'Added a session', group: 'classes' },
  'session.cancel': { label: 'Cancelled a session', group: 'classes' },
  'session.move': { label: 'Moved a session', group: 'classes' },
  'enrolment.create': { label: 'Enrolled a student', group: 'classes' },
  'enrolment.withdraw': { label: 'Withdrew a student', group: 'classes' },
  'enrolment.transfer': { label: 'Moved a student to another class', group: 'classes' },
  'lesson.save': { label: 'Saved a lesson', group: 'teaching' },
  'lesson.attach': { label: 'Attached a file to a lesson', group: 'teaching' },
  'lesson.detach': { label: 'Removed a file from a lesson', group: 'teaching' },
  'report.save': { label: 'Saved a weekly report', group: 'teaching' },
  'assessment.save': { label: 'Saved classwork, homework or an exam', group: 'teaching' },
  'assessment.delete': { label: 'Deleted classwork, homework or an exam', group: 'teaching' },
  'assessment.starter': { label: 'Changed starter files', group: 'teaching' },
  'qa.restore': { label: 'Kept a reported post', group: 'teaching' },
  'qa.remove': { label: 'Removed a reported post', group: 'teaching' },
  'settings.update': { label: 'Changed the club settings', group: 'settings' },
  'auth.sign_in': { label: 'Signed in', group: 'signins' },
  'auth.session_expired': { label: 'Was signed out', group: 'signins' },
};

export const auditLabel = (action: string) => AUDIT_ACTIONS[action]?.label ?? action;
export const actionsIn = (group: AuditGroup) =>
  Object.entries(AUDIT_ACTIONS)
    .filter(([, v]) => v.group === group)
    .map(([a]) => a);

export const PAGE_SIZE = 50;

// From the address bar. With no group, everything except sign-ins is shown (they would bury the changes).
export type AuditFilters = { group: AuditGroup | ''; person: string; from: string; to: string; before: number | null };
type Params = Record<string, string | string[] | undefined>;

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

export function parseAuditFilters(p: Params): AuditFilters {
  const group = one(p.group);
  let from = one(p.from);
  let to = one(p.to);
  from = isDate(from) ? from : '';
  to = isDate(to) ? to : '';
  if (from && to && from > to) [from, to] = [to, from];
  const before = Number(one(p.before));
  return {
    group: group in AUDIT_GROUPS ? (group as AuditGroup) : '',
    person: one(p.person).trim().slice(0, 60),
    from,
    to,
    before: Number.isSafeInteger(before) && before > 0 ? before : null,
  };
}

// ── Details ──────────────────────────────────────────────────────────────────────────────────────────────────

export type DetailLine = { label: string; value: string };
type Detail = Record<string, unknown>;

const VIA: Record<string, string> = { csv: 'Imported from a CSV file', login_slips: 'Login slips for a class' };
const TEXT: [key: string, label: string][] = [
  ['changeReason', 'Why it changed'],
  ['reason', 'Reason'],
  ['overrideReason', 'Issued without a Pass because'],
  ['name', 'Name'],
  ['dates', 'Dates'],
  ['before', 'Before'],
  ['code', 'Code'],
  ['title', 'Title'],
  ['username', 'Username'],
  ['filename', 'File'],
  ['clubName', 'Club name'],
  ['timeZone', 'Time zone'],
  ['certificateSigner', 'Certificate signer'],
];
// class.update's list of what changed.
const CHANGED: Record<string, string> = {
  name: 'name',
  course: 'course',
  term: 'term',
  day: 'day',
  firstDate: 'first date',
  weeks: 'number of weeks',
  startTime: 'time',
  minutes: 'length',
  room: 'room',
  capacity: 'capacity',
  teachers: 'teachers',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
const num = (v: unknown) => (typeof v === 'number' ? String(v) : typeof v === 'string' && v !== '' ? v : '–');
const resultOf = (v: unknown) => RESULT_LABEL[v as 'pass' | 'fail'] ?? null;

// 'Fail · 58 · Good', or 'Pass · final 61 · Good' when the teacher set the final score.
function reportSummary(r: unknown): string {
  const x = (r ?? {}) as Detail;
  return [
    resultOf(x.result) ?? 'No result',
    x.finalScore !== null && x.finalScore !== undefined
      ? `final ${x.finalScore}`
      : x.score !== null && x.score !== undefined
        ? String(x.score)
        : null,
    RATING_LABEL[x.rating as Rating] ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
}

// `names` turns ids into names (students, classes), looked up by the caller. Ids themselves aren't shown.
export function detailLines(action: string, detail: unknown, names: Map<string, string>): DetailLine[] {
  if (!detail || typeof detail !== 'object') return [];
  const d = detail as Detail;
  const lines: DetailLine[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value) lines.push({ label, value });
  };

  // What changed, before → after.
  if ('previousScore' in d && ('score' in d || 'value' in d)) {
    const after = 'value' in d ? (d.value === '' ? 'cleared' : String(d.value)) : num(d.score);
    add('Score', `${num(d.previousScore)} → ${after}`);
  } else if (typeof d.score === 'number' && action !== 'termreport.override') add('Score', String(d.score));
  if (typeof d.version === 'number') add('Version', String(d.version));
  if (d.late === true) add('Late', 'Yes');

  // Term reports.
  if (action === 'termreport.amend') {
    add('Why it changed', typeof d.changeReason === 'string' ? d.changeReason : null);
    add('Reason for the result', typeof d.reason === 'string' ? d.reason : null);
    add('Before', reportSummary(d.before));
    add('After', reportSummary(d.after));
    return lines;
  }
  if (action === 'termreport.override') {
    add('Chosen', reportSummary(d));
    add('Suggested', resultOf(d.suggested));
    if (typeof d.calculated === 'number') add('Calculated score', String(d.calculated));
  } else if (action === 'termreport.publish') {
    add('Result', reportSummary(d));
  } else add('Result', resultOf(d.result));

  // Promotion: who went where.
  if (action === 'class.promote') {
    add('Moved', `${num(d.moved)} moved on, ${num(d.left)} not moved`);
    for (const m of Array.isArray(d.moves) ? (d.moves as Detail[]) : [])
      add(
        names.get(String(m.studentId)) ?? 'A student no longer in the LMS',
        `${resultOf(m.result) ?? 'No result'} → ${m.to ? (names.get(String(m.to)) ?? 'a class no longer in the LMS') : 'not moved'}`,
      );
  }

  if (Array.isArray(d.changed) && d.changed.length) add('Changed', cap(d.changed.map((f) => CHANGED[String(f)] ?? String(f)).join(', ')));
  if (typeof d.role === 'string') add('Role', cap(d.role));
  for (const [key, label] of TEXT) if (typeof d[key] === 'string' && !lines.some((l) => l.label === label)) add(label, d[key] as string);
  if (typeof d.status === 'string')
    add('Status', typeof d.previousStatus === 'string' ? `${cap(d.previousStatus)} → ${cap(d.status)}` : cap(d.status));
  if (typeof d.kind === 'string') add('Type', cap(d.kind));
  if (typeof d.state === 'string') add('State', cap(d.state));
  if (typeof d.toClassId === 'string') add('To class', names.get(d.toClassId) ?? 'a class no longer in the LMS');
  for (const [key, label] of [
    ['date', 'Date'],
    ['from', 'From'],
    ['to', 'To'],
    ['on', 'On'],
    ['enrolledOn', 'From'],
  ] as const)
    if (typeof d[key] === 'string' && isDate(d[key] as string)) add(label, formatDate(d[key] as string));
  if (typeof d.files === 'number') add('Files', String(d.files));
  if (typeof d.topics === 'number') add('Topics', String(d.topics));
  if (typeof d.via === 'string') add('How', VIA[d.via] ?? d.via);
  return lines;
}
