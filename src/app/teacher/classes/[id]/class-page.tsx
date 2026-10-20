import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { getClass } from '@/modules/academics/classes';
import { pageData, requireActor } from '@/server/guard';

// Shared by the sections of a teacher's class (Weeks, Students, Syllabus, Schedule), which the sidebar lists.
export async function teacherClass(params: Promise<{ id: string }>) {
  const actor = await requireActor('teacher.area');
  const { id } = await params;
  const c = await pageData(getClass(actor, id));
  return { actor, c };
}

export function ClassHeader({ name }: { name: string }) {
  return <PageHeader eyebrow={<Link href="/teacher">My classes</Link>} title={name} />;
}
