'use server';
import { revalidatePath } from 'next/cache';
import { formText as t, toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { deleteAssessment, saveAssessment, type AssessmentInput } from './service';

const refresh = (classId: string) => {
  revalidatePath(`/teacher/classes/${classId}`, 'layout');
  revalidatePath(`/student/classes/${classId}`, 'layout');
};

export async function saveAssessmentAction(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    const classId = t(form, 'classId') ?? '';
    const input: AssessmentInput = {
      kind: (t(form, 'kind') ?? '') as AssessmentInput['kind'],
      title: t(form, 'title') ?? '',
      instructionsMd: t(form, 'instructionsMd') ?? '',
      language: (t(form, 'language') ?? '') as AssessmentInput['language'],
      maxScore: t(form, 'maxScore') ?? '',
      dueMode: (t(form, 'dueMode') ?? '') as AssessmentInput['dueMode'],
      dueDate: t(form, 'dueDate'),
      dueTime: t(form, 'dueTime'),
      allowLate: form.get('allowLate') === 'on',
      latePenaltyPct: t(form, 'latePenaltyPct') ?? '0',
      intent: t(form, 'intent') === 'publish' ? 'publish' : 'draft',
    };
    await saveAssessment(await currentActor(), t(form, 'sessionId') ?? '', input, t(form, 'assessmentId'));
    refresh(classId);
    return {
      ok: true,
      message:
        input.intent === 'publish' ? `“${input.title.trim()}” is published to the class.` : 'Saved as a draft. Students can’t see it yet.',
    };
  });
}

export async function deleteAssessmentAction(classId: string, assessmentId: string): Promise<FormResult> {
  return toResult(async () => {
    await deleteAssessment(await currentActor(), assessmentId);
    refresh(classId);
    return { ok: true, message: 'Deleted.' };
  });
}
