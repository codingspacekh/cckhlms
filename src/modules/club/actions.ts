'use server';
import { revalidatePath } from 'next/cache';
import { currentActor } from '@/server/guard';
import { ForbiddenError, ValidationError } from '@/server/errors';
import { updateClubSettings } from './service';

export type SettingsResult = { ok: true; message: string } | { ok: false; error: string; field?: string };

export async function updateSettingsAction(_prev: SettingsResult | null, form: FormData): Promise<SettingsResult> {
  try {
    await updateClubSettings(await currentActor(), {
      clubName: String(form.get('clubName') ?? ''),
      timeZone: String(form.get('timeZone') ?? ''),
    });
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Settings saved.' };
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.message, field: err.field };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message };
    throw err;
  }
}
