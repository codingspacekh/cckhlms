// FR-ADM-11/12 · FR-STU-08 · BR-05 · BR-06 · NFR-11: Admin issues certificates to students who passed (or, with a
// reason, to one who didn't); reissuing revokes the old code; anyone with the code can check it on /verify; a
// student downloads their own.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm } from '@/modules/academics/terms';
import {
  certificateClasses,
  certificateFile,
  certificateRows,
  issueCertificate,
  issueForPassed,
  myCertificates,
  reissueCertificate,
  revokeCertificate,
  verifyCertificate,
} from '@/modules/certificates/certificates';
import { createAccount } from '@/modules/identity/service';
import { publishTermReports, saveTermReport } from '@/modules/reporting/term-reports';
import type { Actor } from '@/server/actor';
import { ForbiddenError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
let sophea: Actor, bopha: Actor, chenda: Actor, kosal: Actor, dara: Actor;
let classId = '';
let draftClassId = '';
const enrolmentOf: Record<string, string> = {};
const AFTER_TERM = new Date('2027-04-10T03:00:00Z');
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];
const auditOf = async (action: string) =>
  (await pool.query(`select actor_id, entity_id, detail from audit_log where action = $1 order by id`, [action])).rows;
const report = (result: 'pass' | 'fail') => ({
  rating: 'good' as const,
  comment: '',
  needsSupport: false,
  supportNote: '',
  finalScore: result === 'pass' ? '78' : '42',
  result,
  reason: 'Final exam marked on paper.',
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
  dara = await person('student', 'Dara Pen');
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  const py = await createCourse(admin, { code: 'PY1', name: 'Python Level 1', defaultLanguage: 'python' });
  const make = async (day: 'sat' | 'sun', firstDate: string) => {
    const r = await createClass(admin, {
      courseId: py.id,
      termId: term.id,
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
  classId = await make('sat', '2027-01-09');
  draftClassId = await make('sun', '2027-01-10');
  for (const [s, result] of [
    [bopha, 'pass'],
    [chenda, 'fail'],
    [kosal, 'pass'],
  ] as const) {
    const e = await enrolStudent(admin, classId, s.userId, { enrolledOn: '2027-01-09' });
    if (e.status !== 'enrolled') throw new Error('not enrolled');
    enrolmentOf[s.userId] = e.enrolmentId;
    await saveTermReport(sophea, e.enrolmentId, report(result), { now: AFTER_TERM });
  }
  await publishTermReports(sophea, classId, { now: AFTER_TERM });
  const d = await enrolStudent(admin, draftClassId, dara.userId, { enrolledOn: '2027-01-10' });
  if (d.status !== 'enrolled') throw new Error('not enrolled');
  enrolmentOf[dara.userId] = d.enrolmentId;
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('issuing (BR-05)', () => {
  it('issues a certificate to a student who passed, and logs it', async () => {
    const c = await issueCertificate(admin, enrolmentOf[bopha.userId]!);
    expect(c.code).toMatch(/^[0-9A-Z]{26}$/);
    expect(await auditOf('certificate.issue')).toEqual([
      { actor_id: admin.userId, entity_id: c.id, detail: { enrolmentId: enrolmentOf[bopha.userId], result: 'pass' } },
    ]);
  });

  it('refuses a student who didn’t pass, unless Admin gives a reason', async () => {
    await expect(issueCertificate(admin, enrolmentOf[chenda.userId]!)).rejects.toThrow(
      'Chenda Ouk didn’t pass this class. To issue a certificate anyway, write why.',
    );
    await expect(issueCertificate(admin, enrolmentOf[chenda.userId]!, { overrideReason: '   ' })).rejects.toThrow(/write why/);
    const c = await issueCertificate(admin, enrolmentOf[chenda.userId]!, { overrideReason: 'Passed the resit on 18 Apr.' });
    expect((await auditOf('certificate.issue')).at(-1)).toMatchObject({
      entity_id: c.id,
      detail: { result: 'fail', overrideReason: 'Passed the resit on 18 Apr.' },
    });
  });

  it('waits for the term reports: there is no result before they are published', async () => {
    await expect(issueCertificate(admin, enrolmentOf[dara.userId]!, { overrideReason: 'x' })).rejects.toThrow(
      'Publish this class’s term reports first: certificates follow their results.',
    );
  });

  it('gives a student only one valid certificate per class', async () => {
    await expect(issueCertificate(admin, enrolmentOf[bopha.userId]!)).rejects.toThrow(
      'Bopha Lim already has a certificate for this class. Reissue it instead.',
    );
  });

  it('issues to everyone who passed and has none yet, all at once', async () => {
    expect(await issueForPassed(admin, classId)).toEqual({ issued: 1 }); // Kosal; Bopha has one, Chenda didn't pass
    expect(await issueForPassed(admin, classId)).toEqual({ issued: 0 });
    const rows = (await certificateRows(admin, classId)).rows;
    expect(rows.map((r) => [r.name, r.result, !!r.certificate])).toEqual([
      ['Bopha Lim', 'pass', true],
      ['Chenda Ouk', 'fail', true],
      ['Kosal Meas', 'pass', true],
    ]);
  });

  it('is for Admin only', async () => {
    await expect(issueCertificate(sophea, enrolmentOf[kosal.userId]!)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(issueForPassed(sophea, classId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(certificateRows(sophea, classId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('checking a certificate (FR-ADM-12)', () => {
  it('shows who, what and when for a valid code, however it is typed', async () => {
    const { code } = (await certificateRows(admin, classId)).rows[0]!.certificate!;
    const typed = code.toLowerCase().replace(/(.{4})/g, '$1-');
    expect(await verifyCertificate(typed)).toEqual({
      status: 'valid',
      studentName: 'Bopha Lim',
      courseName: 'Python Level 1',
      termName: 'Term 1 · 2027',
      issuedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      revokedOn: null,
    });
  });

  it('knows nothing about a code that was never issued', async () => {
    expect(await verifyCertificate('ABCD2345EFGH6789JKMNPQRSTV')).toBeNull();
    expect(await verifyCertificate('not a code')).toBeNull();
  });
});

describe('reissuing and revoking (BR-06)', () => {
  it('reissuing gives a new code and revokes the old one', async () => {
    const old = (await certificateRows(admin, classId)).rows[0]!.certificate!;
    await expect(reissueCertificate(admin, old.id, '')).rejects.toThrow('Write why you are reissuing it.');
    const fresh = await reissueCertificate(admin, old.id, 'Name spelled wrong on the first one.');
    expect(fresh.code).not.toBe(old.code);
    expect(await verifyCertificate(old.code)).toMatchObject({ status: 'revoked', revokedOn: expect.any(String) });
    expect(await verifyCertificate(fresh.code)).toMatchObject({ status: 'valid' });
    expect((await auditOf('certificate.reissue')).at(-1)).toMatchObject({
      entity_id: fresh.id,
      detail: { replaces: old.id, reason: 'Name spelled wrong on the first one.' },
    });
    await expect(reissueCertificate(admin, old.id, 'again')).rejects.toThrow('This certificate was already revoked.');
  });

  it('revoking needs a reason and is logged', async () => {
    const c = (await certificateRows(admin, classId)).rows[1]!.certificate!; // Chenda's
    await expect(revokeCertificate(admin, c.id, '')).rejects.toThrow('Write why you are revoking it.');
    await revokeCertificate(admin, c.id, 'Issued by mistake.');
    expect(await verifyCertificate(c.code)).toMatchObject({ status: 'revoked' });
    expect((await certificateRows(admin, classId)).rows[1]!.certificate).toBeNull();
    expect((await auditOf('certificate.revoke')).at(-1)).toMatchObject({ entity_id: c.id, detail: { reason: 'Issued by mistake.' } });
  });
});

describe('downloading (FR-STU-08)', () => {
  it('gives the student their own valid certificates, and the PDF', async () => {
    const mine = await myCertificates(bopha);
    expect(mine.map((c) => [c.courseName, c.termName])).toEqual([['Python Level 1', 'Term 1 · 2027']]);
    const file = await certificateFile(bopha, mine[0]!.id);
    expect(new TextDecoder().decode(file.data.slice(0, 5))).toBe('%PDF-');
    expect(file.filename).toBe('Certificate - Bopha Lim - Python Level 1.pdf');
    expect(await myCertificates(chenda)).toEqual([]); // revoked
  });

  it('lets Admin download any valid certificate, and nobody else', async () => {
    const id = (await myCertificates(kosal))[0]!.id;
    expect((await certificateFile(admin, id)).data.byteLength).toBeGreaterThan(1000);
    await expect(certificateFile(bopha, id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(certificateFile(sophea, id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('NFR-09: writes names in Khmer and other scripts with fonts that have their letters', async () => {
    const sreyleak = await createAccount(admin, { role: 'student', name: 'ស្រីល័ក្ខ Chea' });
    const e = await enrolStudent(admin, draftClassId, sreyleak.userId, { enrolledOn: '2027-01-10' });
    if (e.status !== 'enrolled') throw new Error('not enrolled');
    await pool.query(
      `insert into certificate (id, enrolment_id, code, template_version) values ('khmer', $1, 'KHMERCERT2345678901234567X', 1)`,
      [e.enrolmentId],
    );
    const pdf = new TextDecoder('latin1').decode((await certificateFile(admin, 'khmer')).data);
    expect(pdf).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSansKhmer/);
    expect(pdf).not.toContain('/BaseFont /Helvetica');
  });

  it('refuses a revoked certificate', async () => {
    const revoked = await one(`select id from certificate where revoked_at is not null limit 1`);
    await expect(certificateFile(admin, revoked.id)).rejects.toThrow('This certificate was revoked.');
  });
});

describe('the Certificates page', () => {
  it('lists the classes of the latest terms with how many passed and how many hold a certificate', async () => {
    expect((await certificateClasses(admin, { now: AFTER_TERM })).map((c) => [c.name, c.students, c.passed, c.issued])).toEqual([
      ['Python Level 1 · Sat 09:00', 3, 2, 2],
      ['Python Level 1 · Sun 09:00', 2, 0, 1], // with the Khmer-name certificate above
    ]);
  });
});
