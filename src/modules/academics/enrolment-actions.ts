'use server';
import { revalidatePath } from 'next/cache';
import { formText as t, toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { enrolStudent, transferEnrolment, withdrawEnrolment } from './enrolments';

export type EnrolFormResult = FormResult<{ warnings: string[] }>;
const refresh = (classId: string) => {
  revalidatePath(`/admin/classes/${classId}`);
  revalidatePath(`/teacher/classes/${classId}`);
};

export async function enrolAction(_prev: EnrolFormResult | null, form: FormData): Promise<EnrolFormResult> {
  return toResult(async () => {
    const classId = t(form, 'classId') ?? '';
    const r = await enrolStudent(await currentActor(), classId, t(form, 'studentId') ?? '', {
      enrolledOn: t(form, 'enrolledOn') || undefined,
      confirmClashes: t(form, 'confirmClashes') === '1',
    });
    if (r.status === 'needs-confirmation')
      return { ok: false, error: 'This student already has a class at that time.', data: { warnings: r.warnings } };
    refresh(classId);
    return { ok: true, message: 'Student enrolled.' };
  });
}

export async function withdrawAction(classId: string, enrolmentId: string, on: string): Promise<FormResult> {
  return toResult(async () => {
    await withdrawEnrolment(await currentActor(), enrolmentId, { on });
    refresh(classId);
    return { ok: true, message: 'Student withdrawn.' };
  });
}

export async function transferAction(
  classId: string,
  enrolmentId: string,
  toClassId: string,
  on: string,
  confirmClashes: boolean,
): Promise<EnrolFormResult> {
  return toResult(async () => {
    const r = await transferEnrolment(await currentActor(), enrolmentId, toClassId, { on, confirmClashes });
    if (r.status === 'needs-confirmation')
      return { ok: false, error: 'The student already has a class at that time.', data: { warnings: r.warnings } };
    refresh(classId);
    refresh(toClassId);
    return { ok: true, message: 'Student moved.' };
  });
}
