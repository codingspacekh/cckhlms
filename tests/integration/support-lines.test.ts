// M14c · FR-ADM-18, FR-STU-13, BR-29: Admin makes a support line (one extra online session) for students who need
// help. Its students see it on My week and its students' class teachers on Today, both with a notification, until it
// ends. A student sees no other names; a teacher sees only their own students. In the app only.
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appPool } from '@/db/client';
import { createClass } from '@/modules/academics/classes';
import { createCourse } from '@/modules/academics/courses';
import { enrolStudent } from '@/modules/academics/enrolments';
import { createTerm, setTermStatus } from '@/modules/academics/terms';
import { createAccount } from '@/modules/identity/service';
import { notificationsFor } from '@/modules/notifications/notifications';
import {
  cancelSupportLine,
  listSupportLines,
  mySupportLines,
  saveSupportLine,
  supportLineForm,
  teacherSupportLines,
} from '@/modules/support/support-lines';
import { saveSheetCell } from '@/modules/teaching/report-sheet';
import { weeksOf } from '@/modules/teaching/weeks';
import type { Actor } from '@/server/actor';
import { ForbiddenError } from '@/server/errors';
import { startup } from '@/server/startup';
import { emptyDatabase } from './db';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const admin: Actor = { userId: '', username: 'admin', name: 'Admin', role: 'admin', sessionId: 's' };
// Club time is UTC+7.
const NOW = { now: new Date('2027-01-20T03:00:00Z') }; // Wed 20 Jan 2027, 10:00
const DURING = { now: new Date('2027-01-21T11:30:00Z') }; // Thu 21 Jan, 18:30
const AFTER = { now: new Date('2027-01-21T12:00:00Z') }; // Thu 21 Jan, 19:00
const LATER = (minutes: number) => ({ now: new Date(NOW.now.getTime() + minutes * 60_000) });
const ZOOM = 'https://us06web.zoom.us/j/89990001112';
let sophea: Actor, vibol: Actor, dara: Actor;
const s: Record<string, Actor> = {}; // students by first name
const e: Record<string, string> = {}; // their enrolments
let py = '';
let line = '';
const input = (over: Record<string, unknown> = {}) => ({
  enrolmentIds: [e.Kosal, e.Nita],
  date: '2027-01-21',
  startTime: '18:00',
  minutes: 60,
  meetingUrl: ZOOM,
  message: 'Bring your Week 2 program.',
  ...over,
});
const lastAudit = async (action: string) =>
  (await pool.query('select entity_id, detail from audit_log where action = $1 order by id desc limit 1', [action])).rows[0];
const supportNotes = async (who: Actor, area: 'student' | 'teacher', opts = NOW) =>
  (await notificationsFor(who, area, opts)).items.filter((n) => n.kind === 'support_line').map((n) => n.title);

beforeAll(async () => {
  await emptyDatabase(pool);
  await startup({ bootstrapAdmin: { username: 'admin', password: 'admin-password-123' } });
  admin.userId = (await pool.query(`select id from "user" where username = 'admin'`)).rows[0].id;
  const person = async (role: 'teacher' | 'student', name: string): Promise<Actor> => {
    const r = await createAccount(admin, { role, name });
    return { userId: r.userId, username: r.username, name, role, sessionId: 's' };
  };
  sophea = await person('teacher', 'Sophea Chan');
  vibol = await person('teacher', 'Vibol Heng');
  dara = await person('teacher', 'Dara Kim');
  const term = await createTerm(admin, { year: 2027, number: 1, startDate: '2027-01-09', endDate: '2027-04-04' });
  await setTermStatus(admin, term.id, 'active');
  const make = async (code: string, name: string, over: Record<string, unknown>) => {
    const course = await createCourse(admin, { code, name, defaultLanguage: 'python' });
    const r = await createClass(admin, { courseId: course.id, termId: term.id, minutes: 90, weeks: 10, confirmClashes: true, ...over });
    if (r.status !== 'created') throw new Error(`${name} not created`);
    return r.classId;
  };
  py = await make('PY1', 'Python Level 1', {
    day: 'sat',
    startTime: '09:00',
    firstDate: '2027-01-09',
    leadTeacherId: sophea.userId,
    assistantTeacherIds: [vibol.userId],
  });
  const web = await make('WEB', 'Web Basics', { day: 'sun', startTime: '10:00', firstDate: '2027-01-10', leadTeacherId: dara.userId });
  for (const [classId, names] of [
    [py, ['Kosal Meas', 'Bopha Lim']],
    [web, ['Nita Kong', 'Piseth Long']],
  ] as const)
    for (const name of names) {
      const first = name.split(' ')[0]!;
      s[first] = await person('student', name);
      const r = await enrolStudent(admin, classId, s[first]!.userId, { enrolledOn: '2027-01-09', now: NOW.now });
      if (r.status !== 'enrolled') throw new Error(`${name} not enrolled`);
      e[first] = r.enrolmentId;
    }
  // Sophea flags Kosal on week 2's sheet.
  const week2 = (await weeksOf(py)).find((x) => x.week === 2)!.id;
  await saveSheetCell(sophea, week2, e.Kosal!, { field: 'needsSupport', value: 'yes' }, NOW);
  await saveSheetCell(sophea, week2, e.Kosal!, { field: 'note', value: 'Missed two weeks.' }, NOW);
});
afterAll(async () => {
  await pool.end();
  await appPool.end();
});

describe('making a support line', () => {
  it('the form offers every student in an active class, with their teachers and their latest weekly note', async () => {
    const f = await supportLineForm(admin, { picked: [e.Kosal!, e.Nita!, 'not-an-enrolment'] });
    expect(f.picked).toEqual([e.Kosal, e.Nita]);
    expect(f.lastMeetingUrl).toBeNull();
    expect(f.candidates.map((c) => [c.name, c.className, c.teachers, c.why])).toEqual([
      ['Bopha Lim', 'Python Level 1 · Sat 09:00', ['Sophea Chan', 'Vibol Heng'], null],
      ['Kosal Meas', 'Python Level 1 · Sat 09:00', ['Sophea Chan', 'Vibol Heng'], 'Missed two weeks.'],
      ['Nita Kong', 'Web Basics · Sun 10:00', ['Dara Kim'], null],
      ['Piseth Long', 'Web Basics · Sun 10:00', ['Dara Kim'], null],
    ]);
  });

  it('refuses a time that has passed, no students, a bad link, a length outside the four, or someone not in a class', async () => {
    await expect(saveSupportLine(admin, null, input({ date: '2027-01-20', startTime: '09:00' }), NOW)).rejects.toThrow(
      'Choose a day and time that haven’t passed.',
    );
    await expect(saveSupportLine(admin, null, input({ enrolmentIds: [] }), NOW)).rejects.toThrow('Add at least one student.');
    await expect(saveSupportLine(admin, null, input({ meetingUrl: 'zoom.us/j/1' }), NOW)).rejects.toThrow(/https:\/\//);
    await expect(saveSupportLine(admin, null, input({ meetingUrl: '' }), NOW)).rejects.toThrow('Paste the support line’s Zoom link.');
    await expect(saveSupportLine(admin, null, input({ minutes: 120 }), NOW)).rejects.toThrow(/30, 45, 60 or 90/);
    await expect(saveSupportLine(admin, null, input({ enrolmentIds: ['nobody'] }), NOW)).rejects.toThrow(
      'Choose students who are in a class now.',
    );
  });

  it('is made for any day of the week, and audited without names', async () => {
    line = (await saveSupportLine(admin, null, input(), NOW)).id; // a Thursday
    expect(await lastAudit('support_line.create')).toEqual({
      entity_id: line,
      detail: { date: '2027-01-21', startTime: '18:00', minutes: 60, students: 2 },
    });
    expect((await supportLineForm(admin, { picked: [] })).lastMeetingUrl).toBe(ZOOM);
  });

  it('is listed for Admin with its students and the teachers told', async () => {
    expect((await listSupportLines(admin, NOW)).map((l) => [l.when, l.students, l.teachers, l.status])).toEqual([
      ['Thu 21 Jan · 18:00–19:00', ['Kosal Meas', 'Nita Kong'], ['Dara Kim', 'Sophea Chan', 'Vibol Heng'], 'upcoming'],
    ]);
  });

  it('is for Admin only', async () => {
    await expect(saveSupportLine(sophea, null, input(), NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listSupportLines(sophea, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(supportLineForm(s.Kosal!, { picked: [] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cancelSupportLine(dara, line, NOW)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('who sees it (BR-29)', () => {
  it('its students, with the link and their class teachers, and no other names', async () => {
    const mine = await mySupportLines(s.Kosal!, NOW);
    expect(mine).toEqual([
      {
        id: line,
        date: '2027-01-21',
        startTime: '18:00',
        minutes: 60,
        meetingUrl: ZOOM,
        message: 'Bring your Week 2 program.',
        teachers: ['Sophea Chan', 'Vibol Heng'],
      },
    ]);
    expect(JSON.stringify(mine)).not.toContain('Nita');
    expect(await mySupportLines(s.Bopha!, NOW)).toEqual([]);
    expect(await mySupportLines(s.Piseth!, NOW)).toEqual([]);
  });

  it('each class teacher, lead or assistant, with only their own students named', async () => {
    const forSophea = await teacherSupportLines(sophea, NOW);
    expect(forSophea).toEqual([
      expect.objectContaining({
        id: line,
        meetingUrl: ZOOM,
        students: [{ name: 'Kosal Meas', className: 'Python Level 1 · Sat 09:00', note: 'Missed two weeks.' }],
        others: 1,
      }),
    ]);
    expect(JSON.stringify(forSophea)).not.toContain('Nita');
    expect((await teacherSupportLines(vibol, NOW))[0]!.students.map((x) => x.name)).toEqual(['Kosal Meas']);
    expect((await teacherSupportLines(dara, NOW))[0]!).toMatchObject({ students: [{ name: 'Nita Kong', note: null }], others: 1 });
  });

  it('comes as a notification to its students and their teachers', async () => {
    expect(await supportNotes(s.Kosal!, 'student')).toEqual(['Support line on Thu 21 Jan at 18:00']);
    expect(await supportNotes(s.Bopha!, 'student')).toEqual([]);
    expect(await supportNotes(vibol, 'teacher')).toEqual(['Support line on Thu 21 Jan at 18:00']);
  });

  it('stays until it ends, then goes', async () => {
    expect(await mySupportLines(s.Kosal!, DURING)).toHaveLength(1);
    expect(await mySupportLines(s.Kosal!, AFTER)).toEqual([]);
    expect(await teacherSupportLines(sophea, AFTER)).toEqual([]);
    expect((await listSupportLines(admin, AFTER))[0]!.status).toBe('done');
  });
});

describe('changing or cancelling it', () => {
  it('a change reaches everyone in it, and a student taken out no longer sees it', async () => {
    await saveSupportLine(admin, line, input({ enrolmentIds: [e.Kosal], startTime: '17:00' }), LATER(1));
    expect((await mySupportLines(s.Kosal!, NOW))[0]!.startTime).toBe('17:00');
    expect(await mySupportLines(s.Nita!, NOW)).toEqual([]);
    expect(await teacherSupportLines(dara, NOW)).toEqual([]);
    expect(await supportNotes(s.Kosal!, 'student', LATER(1))).toEqual(['Support line changed: now Thu 21 Jan at 17:00']);
    expect(await lastAudit('support_line.update')).toMatchObject({ entity_id: line, detail: { startTime: '17:00', students: 1 } });
  });

  it('can’t be changed or cancelled once it has started', async () => {
    await expect(saveSupportLine(admin, line, input({ enrolmentIds: [e.Kosal] }), DURING)).rejects.toThrow(/has started/);
    await expect(cancelSupportLine(admin, line, DURING)).rejects.toThrow(/has started/);
  });

  it('cancelling takes it off My week and Today, and tells them', async () => {
    await cancelSupportLine(admin, line, LATER(2));
    expect(await mySupportLines(s.Kosal!, NOW)).toEqual([]);
    expect(await teacherSupportLines(sophea, NOW)).toEqual([]);
    expect(await supportNotes(s.Kosal!, 'student', LATER(2))).toEqual(['Support line on Thu 21 Jan at 17:00 is cancelled']);
    expect((await listSupportLines(admin, NOW))[0]!.status).toBe('cancelled');
    expect(await lastAudit('support_line.cancel')).toMatchObject({ entity_id: line });
    await expect(cancelSupportLine(admin, line, NOW)).rejects.toThrow(/already cancelled/);
    await expect(saveSupportLine(admin, line, input(), NOW)).rejects.toThrow(/cancelled/);
  });
});
