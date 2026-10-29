// ADR-10: authorisation lives in one Policy module and is tested for every role × action.
// Adding an action without a row here fails this file, so no permission can ship untested.
import { describe, expect, it } from 'vitest';
import { ACTIONS, can, homeFor, type Action } from '@/server/policy';
import type { Actor } from '@/server/actor';

const ROLES = ['admin', 'teacher', 'student'] as const;
type Role = (typeof ROLES)[number];

// true = always · false = never · 'own' = only for their own class: one a teacher teaches, or one a student is
// enrolled in · 'lead' = only the class's lead teacher, not its assistants (BR-08) · 'self' = only a thing that
// belongs to them (their own certificate)
type Rule = boolean | 'own' | 'lead' | 'self';
const MATRIX: Record<Action, Record<Role, Rule>> = {
  'admin.area': { admin: true, teacher: false, student: false },
  'teacher.area': { admin: false, teacher: true, student: false },
  'student.area': { admin: false, teacher: false, student: true },
  'accounts.manage': { admin: true, teacher: false, student: false },
  'settings.manage': { admin: true, teacher: false, student: false },
  'terms.manage': { admin: true, teacher: false, student: false },
  'courses.manage': { admin: true, teacher: false, student: false },
  'classes.manage': { admin: true, teacher: false, student: false },
  'class.schedule': { admin: true, teacher: 'own', student: false },
  'class.view': { admin: true, teacher: 'own', student: false },
  'enrolments.manage': { admin: true, teacher: false, student: false },
  'lesson.write': { admin: false, teacher: 'own', student: false },
  'lesson.read': { admin: true, teacher: 'own', student: 'own' },
  'attendance.mark': { admin: false, teacher: 'own', student: false },
  'qa.post': { admin: false, teacher: 'own', student: 'own' },
  'qa.moderate': { admin: false, teacher: 'own', student: false },
  'report.write': { admin: false, teacher: 'own', student: false },
  'assessment.write': { admin: false, teacher: 'own', student: false },
  'assessment.read': { admin: true, teacher: 'own', student: 'own' },
  'work.save': { admin: false, teacher: false, student: 'own' },
  'work.submit': { admin: false, teacher: false, student: 'own' },
  'work.grade': { admin: false, teacher: 'own', student: false },
  'termreport.write': { admin: false, teacher: 'own', student: false },
  'termreport.amend': { admin: true, teacher: 'lead', student: false },
  'certificates.manage': { admin: true, teacher: false, student: false },
  'certificate.download': { admin: true, teacher: false, student: 'self' },
  'audit.view': { admin: true, teacher: false, student: false },
  'playground.use': { admin: false, teacher: false, student: true },
  'code.run': { admin: false, teacher: true, student: true },
  'student.data': { admin: true, teacher: false, student: false },
};

// The actions that change a class's teaching or students' work: refused once the class is archived.
const CHANGES_A_CLASS = new Set<Action>([
  'class.schedule',
  'lesson.write',
  'attendance.mark',
  'qa.post',
  'qa.moderate',
  'report.write',
  'assessment.write',
  'work.save',
  'work.submit',
  'work.grade',
  'termreport.write',
]);

const actor = (role: string): Actor => ({ userId: 'u1', username: 'x', name: 'X', role, sessionId: 's1' });

describe('policy matrix', () => {
  it('has a row for every registered action, and no extra rows', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(Object.keys(MATRIX).sort());
  });

  // actor() has userId u1. A teacher owns a class by teaching it, a student by being enrolled in it.
  const own = (role: Role) => (role === 'student' ? { classStudentIds: ['u1'] } : { classTeacherIds: ['u1'] });
  const wrongList = (role: Role) => (role === 'student' ? { classTeacherIds: ['u1'] } : { classStudentIds: ['u1'] });
  const both = { classTeacherIds: ['u1'], classStudentIds: ['u1'] };
  const other = { classTeacherIds: ['someone-else'], classStudentIds: ['someone-else'] };
  for (const [action, row] of Object.entries(MATRIX) as [Action, Record<Role, Rule>][]) {
    for (const role of ROLES) {
      const rule = row[role];
      if (rule === 'self') {
        it(`${role} may use ${action} only for something of their own`, () => {
          expect(can(actor(role), action, { ownerId: 'u1' })).toBe(true);
          expect(can(actor(role), action, { ownerId: 'someone-else' })).toBe(false);
          expect(can(actor(role), action, both)).toBe(false); // being in the class isn't enough
          expect(can(actor(role), action)).toBe(false);
        });
      } else if (rule === 'lead') {
        it(`${role} may use ${action} only as the class's lead teacher`, () => {
          expect(can(actor(role), action, { classTeacherIds: ['u1'], classLeadIds: ['u1'] })).toBe(true);
          expect(can(actor(role), action, { classTeacherIds: ['u1'], classLeadIds: ['someone-else'] })).toBe(false);
          expect(can(actor(role), action, { classLeadIds: ['u1'] })).toBe(false); // not teaching it any more
          expect(can(actor(role), action, other)).toBe(false);
          expect(can(actor(role), action)).toBe(false);
        });
      } else if (rule === 'own') {
        it(`${role} may use ${action} for their own class only`, () => {
          expect(can(actor(role), action, own(role))).toBe(true);
          expect(can(actor(role), action, other)).toBe(false);
          expect(can(actor(role), action, wrongList(role))).toBe(false);
          expect(can(actor(role), action)).toBe(false);
        });
      } else {
        it(`${role} ${rule ? 'may' : 'may not'} use ${action}, for any class`, () => {
          expect(can(actor(role), action)).toBe(rule);
          expect(can(actor(role), action, both)).toBe(rule);
          expect(can(actor(role), action, other)).toBe(rule);
        });
      }
    }
    it(`nobody signed out may use ${action}`, () => {
      expect(can(null, action)).toBe(false);
    });
  }

  // FR-ADM-14: an archived class (its term is closed, or it was promoted) can be read but not changed. Amending a
  // published term report stays possible: it needs a reason and is logged (BR-08).
  describe('an archived class', () => {
    const allowedCtx = (rule: Rule, role: Role) =>
      rule === 'lead'
        ? { classTeacherIds: ['u1'], classLeadIds: ['u1'] }
        : rule === 'own'
          ? own(role)
          : rule === 'self'
            ? { ownerId: 'u1' }
            : {};
    for (const [action, row] of Object.entries(MATRIX) as [Action, Record<Role, Rule>][]) {
      for (const role of ROLES) {
        const rule = row[role];
        if (rule === false) continue;
        const changes = CHANGES_A_CLASS.has(action);
        it(`${role} ${changes ? 'may not' : 'may still'} use ${action}`, () => {
          expect(can(actor(role), action, { ...allowedCtx(rule, role), classArchived: true })).toBe(!changes);
        });
      }
    }
  });

  it('gives a user with several roles the rights of each', () => {
    expect(can(actor('admin,teacher'), 'admin.area')).toBe(true);
    expect(can(actor('admin,teacher'), 'teacher.area')).toBe(true);
    expect(can(actor('admin,teacher'), 'student.area')).toBe(false);
  });

  it('gives an unknown role no rights', () => {
    for (const a of Object.keys(ACTIONS) as Action[]) expect(can(actor('guest'), a)).toBe(false);
  });
});

describe('homeFor', () => {
  it('sends each role to its own area, admin first for mixed roles', () => {
    expect(homeFor(actor('admin'))).toBe('/admin');
    expect(homeFor(actor('teacher'))).toBe('/teacher');
    expect(homeFor(actor('student'))).toBe('/student');
    expect(homeFor(actor('teacher,admin'))).toBe('/admin');
  });
  it('sends an account with no known role back to sign-in', () => {
    expect(homeFor(actor('guest'))).toBe('/login');
  });
});
