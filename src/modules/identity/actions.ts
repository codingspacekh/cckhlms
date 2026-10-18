'use server';
// Server Actions for the People page. Next.js checks the Origin of every action; the services check
// permissions again (defence in depth) and audit everything.
import { revalidatePath } from 'next/cache';
import { currentActor } from '@/server/guard';
import { ForbiddenError, ValidationError } from '@/server/errors';
import { createAccount, resetPassword, setActive, signOutEverywhere } from './service';

export type Slip = { name: string; username: string; password: string; reason: 'created' | 'reset' };
export type ActionResult = { ok: true; slip?: Slip; message?: string } | { ok: false; error: string; field?: string };

async function run(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.message, field: err.field };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    throw err;
  }
}

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === 'string' ? v : undefined;
};

export async function createAccountAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return run(async () => {
    const actor = await currentActor();
    const name = text(form, 'name') ?? '';
    const r = await createAccount(actor, {
      role: (text(form, 'role') ?? '') as 'student',
      name,
      username: text(form, 'username'),
      guardianName: text(form, 'guardianName'),
      guardianPhone: text(form, 'guardianPhone'),
      phone: text(form, 'phone'),
      notes: text(form, 'notes'),
    });
    revalidatePath('/admin/people');
    return { ok: true, slip: { name: name.trim(), username: r.username, password: r.password, reason: 'created' } };
  });
}

export async function resetPasswordAction(userId: string): Promise<ActionResult> {
  return run(async () => {
    const r = await resetPassword(await currentActor(), userId);
    return { ok: true, slip: { name: r.name, username: r.username, password: r.password, reason: 'reset' } };
  });
}

export async function setActiveAction(userId: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    await setActive(await currentActor(), userId, active);
    revalidatePath('/admin/people');
    return { ok: true, message: active ? 'Account switched on.' : 'Account switched off and signed out.' };
  });
}

export async function signOutEverywhereAction(userId: string): Promise<ActionResult> {
  return run(async () => {
    await signOutEverywhere(await currentActor(), userId);
    return { ok: true, message: 'Signed out on every device.' };
  });
}
