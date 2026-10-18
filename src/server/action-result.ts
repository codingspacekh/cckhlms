// Shared shape for Server Action results: what a form shows after submitting.
import { ForbiddenError, ValidationError } from './errors';

export type FormResult<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; error: string; field?: string; data?: T };

// Turns the errors a person can act on into a result; anything else is a real bug and is re-thrown.
export async function toResult<T>(fn: () => Promise<FormResult<T>>): Promise<FormResult<T>> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.message, field: err.field };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    throw err;
  }
}

export const formText = (form: FormData, key: string): string | undefined => {
  const v = form.get(key);
  return typeof v === 'string' ? v : undefined;
};
