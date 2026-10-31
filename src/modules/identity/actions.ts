'use server';
// Server Actions for the People page. Next.js checks the Origin of every action; the services check
// permissions again (defence in depth) and audit everything.
import { revalidatePath } from 'next/cache';
import { formText, toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { checkStudentImport, importStudents, resetForSlips, type LoginSlip } from './batches';
import type { ImportCheck } from './import-rules';
import { changeOwnPassword, createAccount, deleteAccount, resetPassword, setActive, signOutEverywhere, updateAccount } from './service';

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

export async function updateAccountAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return toResult(async () => {
    await updateAccount(await currentActor(), formText(form, 'userId') ?? '', {
      name: formText(form, 'name') ?? '',
      username: formText(form, 'username'),
      guardianName: formText(form, 'guardianName'),
      guardianPhone: formText(form, 'guardianPhone'),
      phone: formText(form, 'phone'),
      notes: formText(form, 'notes'),
    });
    revalidatePath('/', 'layout'); // names show on class, roster and report pages too
    return { ok: true, message: 'Details saved.' };
  });
}

export async function deleteAccountAction(userId: string): Promise<ActionResult> {
  return toResult(async () => {
    await deleteAccount(await currentActor(), userId);
    revalidatePath('/admin/people');
    return { ok: true, message: 'Account deleted.' };
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

// FR-AUTH-08: check the CSV (writes nothing), then import it all at once.
export async function checkImportAction(text: string): Promise<FormResult<ImportCheck>> {
  return toResult(async () => ({ ok: true, data: await checkStudentImport(await currentActor(), text) }));
}

export async function importStudentsAction(
  text: string,
  classId: string,
): Promise<FormResult<{ slips: LoginSlip[]; enrolled: string | null }>> {
  return toResult(async () => {
    const r = await importStudents(await currentActor(), text, { classId: classId || undefined });
    revalidatePath('/admin/people');
    if (classId) revalidatePath(`/admin/classes/${classId}`);
    return { ok: true, data: r };
  });
}

// FR-AUTH-09: new passwords for the chosen students of a class, for their login slips.
export async function resetForSlipsAction(classId: string, studentIds: string[]): Promise<FormResult<LoginSlip[]>> {
  return toResult(async () => ({ ok: true, data: (await resetForSlips(await currentActor(), classId, studentIds)).slips }));
}

// FR-AUTH-06 (M13, M16a): My account → Change password, for everyone.
export async function changeOwnPasswordAction(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    const actor = await currentActor();
    await changeOwnPassword(actor, {
      current: formText(form, 'current') ?? '',
      next: formText(form, 'next') ?? '',
      again: formText(form, 'again') ?? '',
    });
    const staff = actor?.role.split(',').some((r) => r === 'admin' || r === 'teacher');
    return {
      ok: true,
      message: staff
        ? 'Password changed. Other devices were signed out. Save the new one in your password manager.'
        : 'Password changed. Use your new password next time you sign in.',
    };
  });
}
