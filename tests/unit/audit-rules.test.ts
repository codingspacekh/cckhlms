// FR-SYS-02 · NFR-11: the audit log viewer names every action the LMS records, groups them so Admin can find the
// sensitive ones, and turns each entry's details into lines a person can read.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  actionsIn,
  AUDIT_ACTIONS,
  AUDIT_GROUPS,
  auditLabel,
  detailLines,
  parseAuditFilters,
  SENSITIVE_GROUPS,
} from '@/modules/audit/rules';

// Every `action: '…'` the code passes to audit(), found by reading the source.
function recordedActions(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...recordedActions(path));
    else if (/\.tsx?$/.test(name))
      for (const m of readFileSync(path, 'utf8').matchAll(/\baction: ([^,\n}]+)/g))
        found.push(...[...m[1]!.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((x) => x[1]!));
  }
  return found;
}

describe('the actions', () => {
  it('names every action the code records', () => {
    const recorded = new Set(recordedActions(join(process.cwd(), 'src')));
    expect(recorded.size).toBeGreaterThan(30);
    const unnamed = [...recorded].filter((a) => !AUDIT_ACTIONS[a]);
    expect(unnamed).toEqual([]);
    // Q&A moderation builds its action name from the decision (qa.ts).
    expect(AUDIT_ACTIONS['qa.restore']).toBeDefined();
    expect(AUDIT_ACTIONS['qa.remove']).toBeDefined();
  });

  it('has the sensitive actions of FR-SYS-02 in the sensitive groups', () => {
    const sensitive = new Set(SENSITIVE_GROUPS.flatMap((g) => actionsIn(g)));
    for (const a of [
      'account.create',
      'account.password_reset',
      'account.deactivate',
      'account.reactivate',
      'submission.grade',
      'submission.return',
      'gradebook.cell',
      'termreport.override',
      'termreport.amend',
      'termreport.publish',
      'class.promote',
      'certificate.issue',
      'certificate.reissue',
      'certificate.revoke',
      'student.export',
      'student.erase',
    ])
      expect(sensitive.has(a), a).toBe(true);
    expect(sensitive.has('auth.sign_in')).toBe(false);
  });

  it('puts each action in a known group, and shows an unknown one as it was recorded', () => {
    for (const [a, v] of Object.entries(AUDIT_ACTIONS)) expect(Object.keys(AUDIT_GROUPS), a).toContain(v.group);
    expect(auditLabel('certificate.revoke')).toBe('Revoked a certificate');
    expect(auditLabel('something.new')).toBe('something.new');
  });
});

describe('the filters', () => {
  it('reads the group, person, dates and page from the address', () => {
    expect(parseAuditFilters({ group: 'certificates', person: '  Nita ', from: '2027-01-09', to: '2027-01-31', before: '120' })).toEqual({
      group: 'certificates',
      person: 'Nita',
      from: '2027-01-09',
      to: '2027-01-31',
      before: 120,
    });
  });

  it('ignores what it does not understand, and puts the dates in order', () => {
    expect(parseAuditFilters({ group: 'nope', person: ['a', 'b'], from: '2027-02-30', to: 'soon', before: '-3' })).toEqual({
      group: '',
      person: '',
      from: '',
      to: '',
      before: null,
    });
    expect(parseAuditFilters({ from: '2027-03-01', to: '2027-01-01' })).toMatchObject({ from: '2027-01-01', to: '2027-03-01' });
    expect(parseAuditFilters({ person: 'x'.repeat(200) }).person).toHaveLength(60);
  });
});

describe('the details', () => {
  const names = new Map([
    ['s1', 'Bopha Lim'],
    ['c2', 'Python Level 2 · Sat 09:00'],
  ]);

  it('shows a score change as before → after, with the reason', () => {
    expect(detailLines('submission.grade', { assessmentId: 'a1', studentId: 's1', version: 2, score: 9, previousScore: 7 }, names)).toEqual(
      [
        { label: 'Score', value: '7 → 9' },
        { label: 'Version', value: '2' },
      ],
    );
    expect(detailLines('gradebook.cell', { value: '', previousScore: 8 }, names)).toEqual([{ label: 'Score', value: '8 → cleared' }]);
    expect(detailLines('gradebook.cell', { value: 'excused', previousScore: null }, names)).toEqual([
      { label: 'Score', value: '– → excused' },
    ]);
  });

  it('shows a term change and a status undone (M10)', () => {
    expect(
      detailLines('term.update', { name: 'Term 1 · 2027', dates: 'Sat 2 Jan 2027 – Sat 13 Mar 2027', before: 'Term 1 · 2027 · x' }, names),
    ).toEqual([
      { label: 'Name', value: 'Term 1 · 2027' },
      { label: 'Dates', value: 'Sat 2 Jan 2027 – Sat 13 Mar 2027' },
      { label: 'Before', value: 'Term 1 · 2027 · x' },
    ]);
    expect(detailLines('term.status', { status: 'active', previousStatus: 'closed' }, names)).toEqual([
      { label: 'Status', value: 'Closed → Active' },
    ]);
  });

  it('lists what changed in a class', () => {
    expect(
      detailLines('class.update', { name: 'Python 1 · Morning', changed: ['room', 'startTime', 'teachers'], warnings: [] }, names),
    ).toEqual([
      { label: 'Changed', value: 'Room, time, teachers' },
      { label: 'Name', value: 'Python 1 · Morning' },
    ]);
    // M14a: a class that went online (the link itself is not in the log).
    expect(detailLines('class.update', { name: 'Python 2', changed: ['mode', 'room', 'meetingUrl'], warnings: [] }, names)[0]).toEqual({
      label: 'Changed',
      value: 'Where it meets, room, Zoom link',
    });
  });

  it('shows what a published report was and became', () => {
    expect(
      detailLines(
        'termreport.amend',
        {
          classId: 'c1',
          studentId: 's1',
          changeReason: 'Exam re-marked.',
          reason: 'Re-mark moved it over the pass mark.',
          before: { score: 58, result: 'fail', rating: 'good', finalScore: null },
          after: { score: 58, result: 'pass', rating: 'good', finalScore: 61 },
        },
        names,
      ),
    ).toEqual([
      { label: 'Why it changed', value: 'Exam re-marked.' },
      { label: 'Reason for the result', value: 'Re-mark moved it over the pass mark.' },
      { label: 'Before', value: 'Fail · 58 · Good' },
      { label: 'After', value: 'Pass · final 61 · Good' },
    ]);
  });

  it('lists who a promotion moved and where', () => {
    expect(
      detailLines(
        'class.promote',
        {
          moved: 1,
          left: 1,
          moves: [
            { studentId: 's1', result: 'pass', to: 'c2' },
            { studentId: 's9', result: 'fail', to: null },
          ],
        },
        names,
      ),
    ).toEqual([
      { label: 'Moved', value: '1 moved on, 1 not moved' },
      { label: 'Bopha Lim', value: 'Pass → Python Level 2 · Sat 09:00' },
      { label: 'A student no longer in the LMS', value: 'Fail → not moved' },
    ]);
  });

  it('says where a change came from, and leaves out ids and empty values', () => {
    expect(detailLines('account.create', { role: 'student', username: 'bopha.l', via: 'csv' }, names)).toEqual([
      { label: 'Role', value: 'Student' },
      { label: 'Username', value: 'bopha.l' },
      { label: 'How', value: 'Imported from a CSV file' },
    ]);
    expect(detailLines('account.password_reset', { via: 'login_slips', classId: 'c2' }, names)).toEqual([
      { label: 'How', value: 'Login slips for a class' },
    ]);
    expect(
      detailLines('certificate.issue', { enrolmentId: 'e1', result: 'fail', overrideReason: 'Missed the exam through illness.' }, names),
    ).toEqual([
      { label: 'Result', value: 'Fail' },
      { label: 'Issued without a Pass because', value: 'Missed the exam through illness.' },
    ]);
    expect(detailLines('enrolment.transfer', { from: 'e1', toClassId: 'c2', on: '2027-02-06' }, names)).toEqual([
      { label: 'To class', value: 'Python Level 2 · Sat 09:00' },
      { label: 'On', value: 'Sat 6 Feb 2027' },
    ]);
    expect(detailLines('auth.sign_in', null, names)).toEqual([]);
  });
});
