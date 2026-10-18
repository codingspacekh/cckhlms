import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { listCourses } from '@/modules/academics/courses';
import { listTerms } from '@/modules/academics/terms';
import { listPeople } from '@/modules/identity/service';
import { requireActor } from '@/server/guard';
import { NewClassForm } from './NewClassForm';

export const metadata: Metadata = { title: 'New class' };

export default async function NewClassPage() {
  const actor = await requireActor('classes.manage');
  const [courses, terms, teachers] = await Promise.all([listCourses(actor), listTerms(actor), listPeople(actor, 'teacher')]);
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/classes">Classes</Link>} title="New weekend class" />
      <NewClassForm
        courses={courses.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` }))}
        terms={terms
          .filter((t) => t.status !== 'closed')
          .map((t) => ({ id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate }))}
        teachers={teachers.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
      />
    </>
  );
}
