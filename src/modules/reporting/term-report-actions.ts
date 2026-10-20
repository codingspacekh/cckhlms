'use server';
import { revalidatePath } from 'next/cache';
import { formText, toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { publishTermReports, saveTermReport } from './term-reports';
import type { TermReportInput } from './term-report-rules';

const refresh = (classId: string) => {
  revalidatePath(`/teacher/classes/${classId}/reports`);
  revalidatePath(`/admin/classes/${classId}/reports`);
};

export async function saveTermReportAction(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    const classId = formText(form, 'classId') ?? '';
    const input: TermReportInput = {
      rating: (formText(form, 'rating') ?? '') as TermReportInput['rating'],
      comment: formText(form, 'comment') ?? '',
      needsSupport: form.get('needsSupport') === 'on',
      supportNote: formText(form, 'supportNote') ?? '',
      finalScore: formText(form, 'finalScore') ?? '',
      result: (formText(form, 'result') ?? '') as TermReportInput['result'],
      reason: formText(form, 'reason') ?? '',
      changeReason: formText(form, 'changeReason'),
    };
    await saveTermReport(await currentActor(), formText(form, 'enrolmentId') ?? '', input);
    refresh(classId);
    return { ok: true, message: `Report saved for ${formText(form, 'name') ?? 'the student'}.` };
  });
}

export async function publishTermReportsAction(classId: string): Promise<FormResult> {
  return toResult(async () => {
    const { published } = await publishTermReports(await currentActor(), classId);
    refresh(classId);
    revalidatePath('/student', 'layout');
    return { ok: true, message: `${published} ${published === 1 ? 'report' : 'reports'} published.` };
  });
}
