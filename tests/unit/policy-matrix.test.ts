// ADR-10: authorisation lives in one Policy module and is tested for every role × action.
// Adding an action without a row here fails this file, so no permission can ship untested.
import { describe, expect, it } from 'vitest';
import { ACTIONS, can, homeFor, type Action } from '@/server/policy';
import type { Actor } from '@/server/actor';

const ROLES = ['admin', 'teacher', 'student'] as const;
type Role = (typeof ROLES)[number];

// true = always · false = never · 'own' = only for a class the person teaches
type Rule = boolean | 'own';
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
};

const actor = (role: string): Actor => ({ userId: 'u1', username: 'x', name: 'X', role, sessionId: 's1' });

describe('policy matrix', () => {
  it('has a row for every registered action, and no extra rows', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(Object.keys(MATRIX).sort());
  });

  const own = { classTeacherIds: ['u1'] }; // actor() has userId u1
  const other = { classTeacherIds: ['someone-else'] };
  for (const [action, row] of Object.entries(MATRIX) as [Action, Record<Role, Rule>][]) {
    for (const role of ROLES) {
      const rule = row[role];
      if (rule === 'own') {
        it(`${role} may use ${action} for their own class only`, () => {
          expect(can(actor(role), action, own)).toBe(true);
          expect(can(actor(role), action, other)).toBe(false);
          expect(can(actor(role), action)).toBe(false);
        });
      } else {
        it(`${role} ${rule ? 'may' : 'may not'} use ${action}, for any class`, () => {
          expect(can(actor(role), action)).toBe(rule);
          expect(can(actor(role), action, own)).toBe(rule);
          expect(can(actor(role), action, other)).toBe(rule);
        });
      }
    }
    it(`nobody signed out may use ${action}`, () => {
      expect(can(null, action)).toBe(false);
    });
  }

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
