import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { TableScroll } from '@/components/ui/TableScroll';
import { listCourses } from '@/modules/academics/courses';
import { LANGUAGE_LABEL, type Language } from '@/modules/academics/rules';
import { requireActor } from '@/server/guard';
import { CourseForm } from './CourseForm';

export const metadata: Metadata = { title: 'Courses' };

export default async function CoursesPage() {
  const actor = await requireActor('courses.manage');
  const courses = await listCourses(actor);
  return (
    <>
      <PageHeader eyebrow="Club" title="Courses" />
      <div className="grid g21">
        <section className="card flush" aria-label="Courses">
          <TableScroll label="Courses table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Course</th>
                  <th scope="col">Language</th>
                  <th scope="col">Exam / classwork / homework</th>
                  <th scope="col">Pass</th>
                  <th scope="col">Next level</th>
                  <th scope="col">Syllabus</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {courses.length === 0 && (
                  <tr>
                    <td colSpan={8} className="muted">
                      No courses yet. Add the first one with the form.
                    </td>
                  </tr>
                )}
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td className="strong mono">{c.code}</td>
                    <td>{c.name}</td>
                    <td>{LANGUAGE_LABEL[c.defaultLanguage as Language]}</td>
                    <td className="tnum">
                      {c.weightExam} / {c.weightClasswork} / {c.weightHomework}
                    </td>
                    <td className="tnum">{c.passMark}</td>
                    <td className="mono">{c.nextCourseCode ?? '—'}</td>
                    <td>
                      {c.topicCount} topic{c.topicCount === 1 ? '' : 's'}
                    </td>
                    <td>
                      <Link className="btn sm" href={`/admin/courses/${c.id}`} aria-label={`Edit ${c.code}`}>
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
        <CourseForm />
      </div>
    </>
  );
}
