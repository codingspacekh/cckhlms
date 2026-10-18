// Every permission in the LMS is one entry here (ADR-10). tests/unit/policy-matrix.test.ts must have a
// row for each entry, so a permission can't be added without its role × action tests.
import type { Actor } from './actor';

// Optional facts about the thing being acted on, for "own class" rules.
export type PolicyContext = { classTeacherIds?: readonly string[] };
type Rule = (actor: Actor, ctx: PolicyContext) => boolean;

const rolesOf = (a: Actor) => a.role.split(',').map((r) => r.trim());
const hasRole =
  (role: string): Rule =>
  (a) =>
    rolesOf(a).includes(role);
const teachesClass: Rule = (a, ctx) => rolesOf(a).includes('teacher') && (ctx.classTeacherIds ?? []).includes(a.userId);
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
