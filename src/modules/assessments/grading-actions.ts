'use server';
import { revalidatePath } from 'next/cache';
import { formText, toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { gradeSubmission, returnSubmission } from './grading';

type Target = { classId: string; assessmentId: string; studentId: string; version: number };

function refresh(t: Target) {
  revalidatePath(`/teacher/classes/${t.classId}`, 'layout');
  revalidatePath(`/student/classes/${t.classId}`, 'layout');
}

export async function gradeAction(t: Target, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    await gradeSubmission(await currentActor(), t.assessmentId, t.studentId, {
      version: t.version,
      score: formText(form, 'score') ?? '',
      feedbackMd: formText(form, 'feedbackMd') ?? '',
    });
    refresh(t);
    return { ok: true, message: 'Mark saved. The student can see it now.' };
  });
}

export async function returnAction(t: Target, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    await returnSubmission(await currentActor(), t.assessmentId, t.studentId, {
      version: t.version,
      feedbackMd: formText(form, 'feedbackMd') ?? '',
    });
    refresh(t);
    return { ok: true, message: 'Returned for a redo. The student can hand it in again.' };
  });
}
