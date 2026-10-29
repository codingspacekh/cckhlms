'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formText as t, toResult, type FormResult } from '@/server/action-result';
import { currentActor } from '@/server/guard';
import { createCourse, deleteCourse, setSyllabus, updateCourse } from './courses';
import { createTerm, deleteTerm, setTermStatus, updateTerm, type TermStatus } from './terms';

const termFields = (form: FormData) => ({
  year: t(form, 'year'),
  number: t(form, 'number'),
  startDate: t(form, 'startDate'),
  endDate: t(form, 'endDate'),
});

export async function createTermAction(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    const term = await createTerm(await currentActor(), termFields(form));
    revalidatePath('/admin/terms');
    return { ok: true, message: `${term.name} added.` };
  });
}

export async function updateTermAction(_prev: FormResult | null, form: FormData): Promise<FormResult> {
  return toResult(async () => {
    await updateTerm(await currentActor(), t(form, 'termId') ?? '', termFields(form));
    revalidatePath('/admin', 'layout');
    return { ok: true, message: 'Term saved.' };
  });
}

export async function deleteTermAction(id: string): Promise<FormResult> {
  return toResult(async () => {
    await deleteTerm(await currentActor(), id);
    revalidatePath('/admin/terms');
    return { ok: true, message: 'Term deleted.' };
  });
}

export async function setTermStatusAction(id: string, status: TermStatus): Promise<FormResult> {
  return toResult(async () => {
    const { name, classes } = await setTermStatus(await currentActor(), id, status);
    revalidatePath('/', 'layout'); // closing or reopening archives or reopens its classes, for teachers too
    const n = `${classes} class${classes === 1 ? '' : 'es'}`;
    const message =
      status === 'closed'
        ? `${name} is closed and ${n} archived. Reopen it if that was a mistake.`
        : status === 'planned'
          ? `${name} is planned again.`
          : classes > 0
            ? `${name} is active again and ${n} reopened.`
            : `${name} is active.`;
    return { ok: true, message };
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

export async function deleteCourseAction(id: string): Promise<FormResult> {
  return toResult(async () => {
    await deleteCourse(await currentActor(), id);
    revalidatePath('/admin/courses');
    redirect('/admin/courses');
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
