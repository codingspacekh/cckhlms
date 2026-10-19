// Every permission in the LMS is one entry here (ADR-10). tests/unit/policy-matrix.test.ts must have a
// row for each entry, so a permission can't be added without its role × action tests.
import type { Actor } from './actor';

// Optional facts about the thing being acted on, for "own class" rules: who teaches the class, and which
// students are enrolled in it now.
export type PolicyContext = { classTeacherIds?: readonly string[]; classStudentIds?: readonly string[] };
type Rule = (actor: Actor, ctx: PolicyContext) => boolean;

const rolesOf = (a: Actor) => a.role.split(',').map((r) => r.trim());
const hasRole =
  (role: string): Rule =>
  (a) =>
    rolesOf(a).includes(role);
const teachesClass: Rule = (a, ctx) => rolesOf(a).includes('teacher') && (ctx.classTeacherIds ?? []).includes(a.userId);
const studiesInClass: Rule = (a, ctx) => rolesOf(a).includes('student') && (ctx.classStudentIds ?? []).includes(a.userId);
const either =
  (...rules: Rule[]): Rule =>
  (a, ctx) =>
    rules.some((r) => r(a, ctx));

export const ACTIONS = {
  'admin.area': hasRole('admin'),
  'teacher.area': hasRole('teacher'),
  'student.area': hasRole('student'),
  'accounts.manage': hasRole('admin'),
  'settings.manage': hasRole('admin'),
  'terms.manage': hasRole('admin'),
  'courses.manage': hasRole('admin'),
  'classes.manage': hasRole('admin'),
  'class.schedule': either(hasRole('admin'), teachesClass),
  'class.view': either(hasRole('admin'), teachesClass),
  'enrolments.manage': hasRole('admin'),
  'lesson.write': teachesClass,
  'lesson.read': either(hasRole('admin'), teachesClass, studiesInClass),
  'attendance.mark': teachesClass,
  'qa.post': either(teachesClass, studiesInClass),
  'qa.moderate': teachesClass,
  'report.write': teachesClass,
  'assessment.write': teachesClass,
  'assessment.read': either(hasRole('admin'), teachesClass, studiesInClass),
} satisfies Record<string, Rule>;

export type Action = keyof typeof ACTIONS;

export function can(actor: Actor | null, action: Action, ctx: PolicyContext = {}): boolean {
  return actor ? ACTIONS[action](actor, ctx) : false;
}

export function homeFor(actor: Actor): string {
  if (can(actor, 'admin.area')) return '/admin';
  if (can(actor, 'teacher.area')) return '/teacher';
  if (can(actor, 'student.area')) return '/student';
  return '/login';
}
