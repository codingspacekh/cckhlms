'use server';
// Courses → Languages (M18a, BR-32).
import { revalidatePath } from 'next/cache';
import { formText as t, toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { createLanguage, deleteLanguage, updateLanguage } from './languages';

export async function saveLanguageAction(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    const id = t(form, 'id');
    const fields = {
      name: t(form, 'name'),
      byFile: t(form, 'byFile'),
      fileTypes: t(form, 'fileTypes'),
      byLink: t(form, 'byLink'),
      linkSites: t(form, 'linkSites'),
    };
    const actor = await currentActor();
    if (id) await updateLanguage(actor, id, fields);
    else await createLanguage(actor, fields);
    revalidatePath('/admin/courses', 'layout');
    return { ok: true, message: id ? `${fields.name?.trim()} saved.` : `${fields.name?.trim()} added.` };
  });
}

export async function deleteLanguageAction(id: string): Promise<FormResult> {
  return toResult(async () => {
    await deleteLanguage(await currentActor(), id);
    revalidatePath('/admin/courses', 'layout');
    return { ok: true, message: 'Language deleted.' };
  });
}
