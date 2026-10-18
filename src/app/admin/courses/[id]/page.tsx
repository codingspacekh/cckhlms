import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCourse, listCourses } from '@/modules/academics/courses';
import { ValidationError } from '@/server/errors';
import { requireActor } from '@/server/guard';
import { CourseForm } from '../CourseForm';
import { SyllabusForm } from './SyllabusForm';

export const metadata: Metadata = { title: 'Course' };

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor('courses.manage');
  const { id } = await params;
  const course = await getCourse(actor, id).catch((e) => (e instanceof ValidationError ? null : Promise.reject(e)));
  if (!course) notFound();
  const others = (await listCourses(actor)).filter((c) => c.id !== id).map((c) => ({ id: c.id, code: c.code, name: c.name }));
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/courses">Courses</Link>} title={`${course.code} · ${course.name}`} />
      <div className="grid g2 start">
        <CourseForm course={course} others={others} />
        <SyllabusForm courseId={course.id} topics={course.topics.map((t) => t.title)} />
      </div>
    </>
  );
}
