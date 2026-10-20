'use server';
// Server Actions for the People page. Next.js checks the Origin of every action; the services check
// permissions again (defence in depth) and audit everything.
import { revalidatePath } from 'next/cache';
import { formText, toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { createAccount, resetPassword, setActive, signOutEverywhere } from './service';

export type Slip = { name: string; username: string; password: string; reason: 'created' | 'reset' };
export type ActionResult = FormResult<Slip>;

export async function createAccountAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await currentActor();
    const name = formText(form, 'name') ?? '';
    const r = await createAccount(actor, {
      role: (formText(form, 'role') ?? '') as 'student',
      name,
      username: formText(form, 'username'),
      guardianName: formText(form, 'guardianName'),
      guardianPhone: formText(form, 'guardianPhone'),
      phone: formText(form, 'phone'),
      notes: formText(form, 'notes'),
    });
    revalidatePath('/admin/people');
    return { ok: true, data: { name: name.trim(), username: r.username, password: r.password, reason: 'created' } };
  });
}

export async function resetPasswordAction(userId: string): Promise<ActionResult> {
  return toResult(async () => {
    const r = await resetPassword(await currentActor(), userId);
    return { ok: true, data: { name: r.name, username: r.username, password: r.password, reason: 'reset' } };
  });
}

export async function setActiveAction(userId: string, active: boolean): Promise<ActionResult> {
  return toResult(async () => {
    await setActive(await currentActor(), userId, active);
    revalidatePath('/admin/people');
    return { ok: true, message: active ? 'Account switched on.' : 'Account switched off and signed out.' };
  });
}

export async function signOutEverywhereAction(userId: string): Promise<ActionResult> {
  return toResult(async () => {
    await signOutEverywhere(await currentActor(), userId);
    return { ok: true, message: 'Signed out on every device.' };
  });
}
