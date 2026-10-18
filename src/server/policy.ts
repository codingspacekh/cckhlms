// Every permission in the LMS is one entry here (ADR-10). tests/unit/policy-matrix.test.ts must have a
// row for each entry, so a permission can't be added without its role × action tests.
import type { Actor } from './actor';

const rolesOf = (a: Actor) => a.role.split(',').map((r) => r.trim());
const hasRole = (role: string) => (a: Actor) => rolesOf(a).includes(role);

export const ACTIONS = {
  'admin.area': hasRole('admin'),
  'teacher.area': hasRole('teacher'),
  'student.area': hasRole('student'),
  'accounts.manage': hasRole('admin'),
  'settings.manage': hasRole('admin'),
} satisfies Record<string, (actor: Actor) => boolean>;

export type Action = keyof typeof ACTIONS;

export function can(actor: Actor | null, action: Action): boolean {
  return actor ? ACTIONS[action](actor) : false;
}

export function homeFor(actor: Actor): string {
  if (can(actor, 'admin.area')) return '/admin';
  if (can(actor, 'teacher.area')) return '/teacher';
  if (can(actor, 'student.area')) return '/student';
  return '/login';
}
