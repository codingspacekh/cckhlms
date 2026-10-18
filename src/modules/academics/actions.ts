'use server';
import { revalidatePath } from 'next/cache';
import { formText as t, toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { createCourse, setSyllabus, updateCourse } from './courses';
import { createTerm, setTermStatus, type TermStatus } from './terms';

export async function createTermAction(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    const term = await createTerm(await currentActor(), {
      year: t(form, 'year'),
      number: t(form, 'number'),
      startDate: t(form, 'startDate'),
      endDate: t(form, 'endDate'),
    });
    revalidatePath('/admin/terms');
    return { ok: true, message: `${term.name} added.` };
  });
}

export async function setTermStatusAction(id: string, status: TermStatus): Promise<FormResult> {
  return toResult(async () => {
    await setTermStatus(await currentActor(), id, status);
    revalidatePath('/admin/terms');
    return { ok: true };
  });
}

const courseFields = (form: FormData) => ({
  code: t(form, 'code'),
  name: t(form, 'name'),
  description: t(form, 'description'),
  defaultLanguage: t(form, 'defaultLanguage'),
  passMark: t(form, 'passMark'),
  weightExam: t(form, 'weightExam'),
  weightClasswork: t(form, 'weightClasswork'),
  weightHomework: t(form, 'weightHomework'),
  nextCourseId: t(form, 'nextCourseId'),
});

export async function createCourseAction(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    const c = await createCourse(await currentActor(), courseFields(form));
    revalidatePath('/admin/courses');
    return { ok: true, message: `${c.code} added.` };
  });
}

export async function updateCourseAction(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    const id = t(form, 'courseId') ?? '';
    await updateCourse(await currentActor(), id, courseFields(form));
    revalidatePath(`/admin/courses/${id}`);
    revalidatePath('/admin/courses');
    return { ok: true, message: 'Course saved.' };
  });
}

export async function setSyllabusAction(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    const id = t(form, 'courseId') ?? '';
    const text = t(form, 'syllabus') ?? '';
    await setSyllabus(await currentActor(), id, text);
    revalidatePath(`/admin/courses/${id}`);
    revalidatePath('/admin/courses');
    const n = text.split('\n').filter((l) => l.trim()).length;
    return { ok: true, message: `Syllabus saved: ${n} topic${n === 1 ? '' : 's'}.` };
  });
}
