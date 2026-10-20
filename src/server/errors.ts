import type { ZodError } from 'zod';
import type { Actor } from './actor';
import { can, type Action, type PolicyContext } from './policy';

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = 'ForbiddenError';
  }
}

// A problem the person can fix; the message is shown to them as-is.
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
  static fromZod(error: ZodError) {
    const issue = error.issues[0];
    return new ValidationError(issue?.message ?? 'Please check the form.', issue?.path.join('.') || undefined);
  }
}

// Postgres refused a duplicate of a unique key (code 23505), for example two clicks saving the same row at once.
// Drizzle wraps the driver's error, so look at its cause too.
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  for (const e of [err, (err as { cause?: unknown } | null)?.cause]) {
    const pg = e as { code?: string; constraint?: string } | null | undefined;
    if (pg?.code === '23505' && pg.constraint === constraint) return true;
  }
  return false;
}

export function assertCan(actor: Actor | null, action: Action, ctx: PolicyContext = {}): asserts actor is Actor {
  if (!can(actor, action, ctx)) throw new ForbiddenError();
}
