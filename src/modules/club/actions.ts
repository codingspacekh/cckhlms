'use server';
import { revalidatePath } from 'next/cache';
import { formText, toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { updateClubSettings } from './service';

export async function updateSettingsAction(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    await updateClubSettings(await currentActor(), {
      clubName: formText(form, 'clubName') ?? '',
      timeZone: formText(form, 'timeZone') ?? '',
    });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Settings saved.' };
  });
}
