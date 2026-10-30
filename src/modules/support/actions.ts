'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formText as t, toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { cancelSupportLine, saveSupportLine } from './support-lines';

const refresh = () => {
  revalidatePath('/admin/support-lines');
  revalidatePath('/student', 'layout');
  revalidatePath('/teacher', 'layout');
};

// Makes a support line, or changes one (lineId), then shows it in the list.
export async function saveSupportLineAction(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    const id = t(form, 'lineId') || null;
    const r = await saveSupportLine(await currentActor(), id, {
      enrolmentIds: form.getAll('enrolmentIds').map(String),
      date: t(form, 'date') ?? '',
      startTime: t(form, 'startTime') ?? '',
      minutes: t(form, 'minutes') ?? '',
      meetingUrl: t(form, 'meetingUrl') ?? '',
      message: t(form, 'message') ?? '',
    });
    refresh();
    redirect(`/admin/support-lines?${id ? 'changed' : 'made'}=${r.id}`);
  });
}

export async function cancelSupportLineAction(id: string): Promise<FormResult> {
  return toResult(async () => {
    await cancelSupportLine(await currentActor(), id);
    refresh();
    return { ok: true, message: 'Support line cancelled. Its students and teachers are told.' };
  });
}
