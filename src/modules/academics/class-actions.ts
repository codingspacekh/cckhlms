'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formText as t, toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { addMakeUpSession, cancelSession, createClass, deleteClass, moveSession, updateClass } from './classes';

export type CreateClassFormResult = FormResult<{ warnings: string[] }>;

export async function createClassAction(_prev: CreateClassFormResult | null, form: FormData): Promise<CreateClassFormResult> {
  return toResult(async () => {
    const r = await createClass(await currentActor(), {
      courseId: t(form, 'courseId'),
      termId: t(form, 'termId'),
      day: t(form, 'day'),
      startTime: t(form, 'startTime'),
      minutes: t(form, 'minutes'),
      firstDate: t(form, 'firstDate'),
      weeks: t(form, 'weeks'),
      room: t(form, 'room'),
      leadTeacherId: t(form, 'leadTeacherId'),
      cancelledDates: form.getAll('cancelledDates').map(String),
      confirmClashes: t(form, 'confirmClashes'),
    });
    if (r.status === 'needs-confirmation')
      return {
        ok: false,
        error: 'This class clashes with another one. Check below, then create it anyway or change the time or room.',
        data: { warnings: r.warnings },
      };
    revalidatePath('/admin/classes');
    redirect(`/admin/classes/${r.classId}`);
  });
}

export async function updateClassAction(_prev: CreateClassFormResult | null, form: FormData): Promise<CreateClassFormResult> {
  return toResult(async () => {
    const id = t(form, 'classId') ?? '';
    const r = await updateClass(await currentActor(), id, {
      name: t(form, 'name'),
      courseId: t(form, 'courseId'),
      termId: t(form, 'termId'),
      day: t(form, 'day'),
      startTime: t(form, 'startTime'),
      minutes: t(form, 'minutes'),
      firstDate: t(form, 'firstDate'),
      weeks: t(form, 'weeks'),
      room: t(form, 'room'),
      capacity: t(form, 'capacity'),
      leadTeacherId: t(form, 'leadTeacherId'),
      assistantTeacherIds: form.getAll('assistantTeacherIds').map(String),
      confirmClashes: t(form, 'confirmClashes'),
    });
    if (r.status === 'needs-confirmation')
      return {
        ok: false,
        error: 'This change clashes with another class. Check below, then save anyway or change the time, room or teachers.',
        data: { warnings: r.warnings },
      };
    revalidatePath('/admin', 'layout');
    revalidatePath(`/teacher/classes/${id}`, 'layout');
    return { ok: true, message: 'Class saved.' };
  });
}

export async function deleteClassAction(classId: string): Promise<FormResult> {
  return toResult(async () => {
    await deleteClass(await currentActor(), classId);
    revalidatePath('/admin/classes');
    redirect('/admin/classes');
  });
}

export async function cancelSessionAction(classId: string, sessionId: string, reason: string, addWeekAtEnd: boolean): Promise<FormResult> {
  return toResult(async () => {
    await cancelSession(await currentActor(), sessionId, { reason, addWeekAtEnd });
    revalidatePath(`/admin/classes/${classId}`);
    revalidatePath(`/teacher/classes/${classId}`, 'layout'); // every section of the class
    return { ok: true, message: 'Session cancelled.' };
  });
}

export async function moveSessionAction(classId: string, sessionId: string, date: string, startTime: string): Promise<FormResult> {
  return toResult(async () => {
    await moveSession(await currentActor(), sessionId, { date, startTime });
    revalidatePath(`/admin/classes/${classId}`);
    revalidatePath(`/teacher/classes/${classId}`, 'layout'); // every section of the class
    return { ok: true, message: 'Session moved.' };
  });
}

export async function addMakeUpAction(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    const classId = t(form, 'classId') ?? '';
    await addMakeUpSession(await currentActor(), classId, {
      date: t(form, 'date') ?? '',
      startTime: t(form, 'startTime') ?? '',
      minutes: t(form, 'minutes') ?? '',
    });
    revalidatePath(`/admin/classes/${classId}`);
    revalidatePath(`/teacher/classes/${classId}`, 'layout'); // every section of the class
    return { ok: true, message: 'Make-up session added.' };
  });
}
