// FR-SYS-02 · NFR-11: every sensitive action leaves an audit row, and Admin can read the log: newest first, in
// words, with who did it and who or what it was about, filtered by kind of action, person and dates.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm, setTermStatus } from '@/modules/academics/terms';
import { saveCell, saveComment } from '@/modules/assessments/gradebook';
import { gradeSubmission, returnSubmission } from '@/modules/assessments/grading';
import { saveAssessment } from '@/modules/assessments/service';
import { submitWork } from '@/modules/assessments/submissions';
import { auditEntries } from '@/modules/audit/audit-log';
import { actionsIn, PAGE_SIZE, parseAuditFilters, SENSITIVE_GROUPS, type AuditFilters } from '@/modules/audit/rules';
import { issueCertificate, reissueCertificate, revokeCertificate } from '@/modules/certificates/certificates';
import { createAccount, deleteAccount, resetPassword, setActive, signOutEverywhere, updateAccount } from '@/modules/identity/service';
import { eraseStudent } from '@/modules/privacy/erase';
import { exportStudentData } from '@/modules/privacy/export';
import { promote } from '@/modules/promotion/promotion';
import { publishTermReports, saveTermReport } from '@/modules/reporting/term-reports';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { audit } from '@/server/audit';
import { ForbiddenError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let sophea: Actor, bopha: Actor, chenda: Actor, kosal: Actor;
let fromId = '';
const enrolmentOf: Record<string, string> = {};
const DURING = new Date('2027-01-15T10:00:00Z');
const AFTER_TERM = new Date('2027-04-10T03:00:00Z');
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
const filters = (over: Partial<AuditFilters> = {}): AuditFilters => ({ ...parseAuditFilters({}), ...over });
const report = (result: 'pass' | 'fail', over: Record<string, unknown> = {}) => ({
  rating: 'good' as const,
  comment: '',
  needsSupport: false,
  supportNote: '',
  finalScore: '',
  result,
  reason: '',
  ...over,
});

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await one(`select id from "user" where username = 'admin'`)).id;
  const person = async (role: 'teacher' | 'student', name: string): Promise<Actor> => {
    const r = await createAccount(admin, { role, name });
    return { userId: r.userId, username: r.username, name, role, sessionId: 's' };
  };
  sophea = await person('teacher', 'Sophea Chan');
  bopha = await person('student', 'Bopha Lim');
  chenda = await person('student', 'Chenda Ouk');
  kosal = await person('student', 'Kosal Meas');

  // Accounts.
  await resetPassword(admin, chenda.userId);
  await setActive(admin, kosal.userId, false);
  await setActive(admin, kosal.userId, true);
  await signOutEverywhere(admin, kosal.userId);

  // A class, its work and marks.
  const t1 = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const t2 = await createTerm(admin, { year: 2027, number: 2, startDate: '2027-04-24', endDate: '2027-07-11' });
  await setTermStatus(admin, t1.id, 'active');
  const py2 = await createCourse(admin, { code: 'PY2', name: 'Python Level 2', defaultLanguage: 'python' });
  const py1 = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python', nextCourseId: py2.id });
  const weekend = async (courseId: string, termId: string, day: 'sat' | 'sun', firstDate: string) => {
    const r = await createClass(admin, {
      courseId,
      termId,
      day,
      startTime: '09:00',
      minutes: 90,
      firstDate,
      weeks: 10,
      leadTeacherId: sophea.userId,
      confirmClashes: true,
    });
    if (r.status !== 'created') throw new Error('class not created');
    return r.classId;
  };
  fromId = await weekend(py1.id, t1.id, 'sat', '2027-01-09');
  const level2 = await weekend(py2.id, t2.id, 'sat', '2027-04-24');
  const repeat = await weekend(py1.id, t2.id, 'sun', '2027-04-25');
  for (const s of [bopha, chenda]) {
    const e = await enrolStudent(admin, fromId, s.userId, { enrolledOn: '2027-01-09' });
    if (e.status !== 'enrolled') throw new Error('not enrolled');
    enrolmentOf[s.userId] = e.enrolmentId;
  }
  const week1 = (await weeksOf(fromId)).find((s) => s.week === 1)!.id;
  const work = (title: string, kind: 'homework' | 'exam', language: 'python' | 'paper') =>
    saveAssessment(sophea, week1, {
      kind,
      title,
      instructionsMd: '',
      language,
      maxScore: kind === 'exam' ? 100 : 10,
      dueMode: kind === 'exam' ? 'session_end' : 'next_session',
      allowLate: true,
      latePenaltyPct: 10,
      intent: 'publish',
    });
  const homework = (await work('Countdown', 'homework', 'python')).id;
  const exam = (await work('End-term exam', 'exam', 'paper')).id;
  await submitWork(bopha, homework, { now: DURING });
  await returnSubmission(sophea, homework, bopha.userId, { version: 1, feedbackMd: 'Add a loop.' });
  await submitWork(bopha, homework, { now: DURING });
  await gradeSubmission(sophea, homework, bopha.userId, { version: 2, score: '9', feedbackMd: 'Nice.' });
  await saveCell(sophea, exam, bopha.userId, { value: '80', version: null });
  await saveCell(sophea, exam, chenda.userId, { value: '45', version: null });
  await saveComment(sophea, exam, chenda.userId, { comment: 'Revise loops.', version: 1 });

  // Term reports, promotion and a certificate.
  await saveTermReport(sophea, enrolmentOf[bopha.userId]!, report('pass'), { now: AFTER_TERM });
  await saveTermReport(sophea, enrolmentOf[chenda.userId]!, report('fail', { finalScore: '52', reason: 'Missed two weeks.' }), {
    now: AFTER_TERM,
  });
  await publishTermReports(sophea, fromId, { now: AFTER_TERM });
  await saveTermReport(
    admin,
    enrolmentOf[chenda.userId]!,
    report('fail', { rating: 'developing', finalScore: '52', reason: 'Missed two weeks.', changeReason: 'Rating agreed again.' }),
    {
      now: AFTER_TERM,
    },
  );
  await promote(
    admin,
    fromId,
    [
      { enrolmentId: enrolmentOf[bopha.userId]!, toClassId: level2 },
      { enrolmentId: enrolmentOf[chenda.userId]!, toClassId: repeat },
    ],
    { now: AFTER_TERM },
  );
  const cert = await issueCertificate(admin, enrolmentOf[bopha.userId]!);
  const again = await reissueCertificate(admin, cert.id, 'Name spelled wrong.');
  await revokeCertificate(admin, again.id, 'Issued by mistake.');

  // A student's data on request (NFR-07): downloaded, then deleted.
  const leaving = await createAccount(admin, { role: 'student', name: 'Vanna Sok' });
  await exportStudentData(admin, leaving.userId);
  await eraseStudent(admin, leaving.userId, leaving.username);
  // An account added by mistake (M10): its name corrected, then deleted while nobody has used it.
  const typo = await createAccount(admin, { role: 'student', name: 'Vana Sok' });
  await updateAccount(admin, typo.userId, { name: 'Vanna Sok', username: typo.username });
  await deleteAccount(admin, typo.userId);

  // A sign-in, and an entry whose person has since been deleted.
  await audit({ actorId: bopha.userId, action: 'auth.sign_in', ip: '203.0.113.7' });
  await audit({ actorId: null, action: 'settings.update', entity: 'club_settings', entityId: '1', detail: { clubName: 'CCKH' } });
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('recording (NFR-11)', () => {
  it('leaves an audit row for every sensitive action of FR-SYS-02', async () => {
    const recorded = new Set((await pool.query('select distinct action from audit_log')).rows.map((r) => r.action as string));
    const sensitive = SENSITIVE_GROUPS.flatMap((g) => actionsIn(g));
    expect(sensitive.filter((a) => !recorded.has(a))).toEqual([]);
  });
});

describe('reading the log (FR-SYS-02)', () => {
  it('is for Admin only', async () => {
    await expect(auditEntries(sophea, filters())).rejects.toThrow(ForbiddenError);
    await expect(auditEntries(bopha, filters())).rejects.toThrow(ForbiddenError);
    await expect(auditEntries(null, filters())).rejects.toThrow(ForbiddenError);
  });

  it('shows the newest first, in words, with who did it and what it was about', async () => {
    const { rows } = await auditEntries(admin, filters());
    expect(rows.map((r) => r.id)).toEqual([...rows.map((r) => r.id)].sort((a, b) => b - a));
    expect(rows[0]).toMatchObject({ label: 'Changed the club settings', by: null, about: 'Club settings' });

    const find = (action: string) => rows.find((r) => r.action === action)!;
    expect(find('certificate.revoke')).toMatchObject({
      label: 'Revoked a certificate',
      by: { name: 'Club Admin', username: 'admin' },
      about: 'Bopha Lim · Python Level 1 · Sat 09:00',
      lines: [{ label: 'Reason', value: 'Issued by mistake.' }],
    });
    expect(find('class.promote')).toMatchObject({
      about: 'Python Level 1 · Sat 09:00',
      lines: [
        { label: 'Moved', value: '2 moved on, 0 not moved' },
        { label: 'Bopha Lim', value: 'Pass → Python Level 2 · Sat 09:00' },
        { label: 'Chenda Ouk', value: 'Fail → Python Level 1 · Sun 09:00' },
      ],
    });
    expect(find('submission.grade')).toMatchObject({
      by: { name: 'Sophea Chan' },
      about: 'Bopha Lim · Countdown',
      lines: [
        { label: 'Score', value: '– → 9' },
        { label: 'Version', value: '2' },
      ],
    });
    expect(find('gradebook.comment')).toMatchObject({ about: 'Chenda Ouk · End-term exam' });
    expect(find('termreport.amend')).toMatchObject({
      about: 'Chenda Ouk · Python Level 1 · Sat 09:00',
      lines: expect.arrayContaining([
        { label: 'Why it changed', value: 'Rating agreed again.' },
        { label: 'After', value: 'Fail · final 52 · Developing' },
      ]),
    });
    expect(find('account.password_reset')).toMatchObject({ about: 'Chenda Ouk', lines: [] });
    expect(find('enrolment.create')).toMatchObject({ about: expect.stringMatching(/ · Python Level 1 · Sat 09:00$/) });
  });

  it('leaves out sign-ins unless they are asked for', async () => {
    expect((await auditEntries(admin, filters())).rows.some((r) => r.action === 'auth.sign_in')).toBe(false);
    const { rows } = await auditEntries(admin, filters({ group: 'signins' }));
    expect(rows.map((r) => [r.label, r.by?.name, r.ip])).toEqual([['Signed in', 'Bopha Lim', '203.0.113.7']]);
  });

  it('shows one kind of action', async () => {
    const { rows } = await auditEntries(admin, filters({ group: 'certificates' }));
    expect(rows.map((r) => r.action)).toEqual(['certificate.revoke', 'certificate.reissue', 'certificate.issue']);
  });

  it('finds what a person did and what was done to them, by name or username', async () => {
    const about = (await auditEntries(admin, filters({ person: 'chenda' }))).rows.map((r) => r.action);
    expect(about).toEqual(
      expect.arrayContaining([
        'account.create',
        'account.password_reset',
        'enrolment.create',
        'gradebook.cell',
        'gradebook.comment',
        'termreport.override',
        'termreport.publish',
        'termreport.amend',
      ]),
    );
    expect(about).not.toContain('certificate.issue');
    const did = (await auditEntries(admin, filters({ person: sophea.username }))).rows;
    expect(did.every((r) => r.by?.name === 'Sophea Chan' || r.about === 'Sophea Chan')).toBe(true);
    expect(did.map((r) => r.action)).toContain('submission.grade');
    expect((await auditEntries(admin, filters({ person: 'nobody at all' }))).rows).toEqual([]);
  });

  it('finds what happened between two dates in the club’s time zone', async () => {
    const id = Number((await one(`select id from audit_log where action = 'certificate.revoke'`)).id);
    await pool.query(`update audit_log set at = '2027-01-09T17:30:00Z' where id = $1`, [id]); // 00:30 on 10 Jan in Phnom Penh
    const ids = async (from: string, to: string) => (await auditEntries(admin, filters({ from, to }))).rows.map((r) => r.id);
    expect(await ids('2027-01-10', '2027-01-10')).toEqual([id]);
    expect(await ids('2027-01-01', '2027-01-09')).toEqual([]);
    expect(await ids('2027-01-10', '')).toContain(id);
    expect(await ids('', '2027-01-09')).not.toContain(id);
  });

  it(`shows ${PAGE_SIZE} at a time, with a link to older ones`, async () => {
    for (let i = 0; i < PAGE_SIZE + 5; i++)
      await audit({
        actorId: admin.userId,
        action: 'settings.update',
        entity: 'club_settings',
        entityId: '1',
        detail: { timeZone: 'Asia/Phnom_Penh' },
      });
    const first = await auditEntries(admin, filters({ group: 'settings' }));
    expect(first.rows).toHaveLength(PAGE_SIZE);
    expect(first.next).toBe(first.rows.at(-1)!.id);
    const second = await auditEntries(admin, filters({ group: 'settings', before: first.next }));
    expect(second.rows).toHaveLength(6); // 5 more, and the one by a deleted person
    expect(second.rows.at(-1)).toMatchObject({ by: null });
    expect(second.next).toBeNull();
  });
});
