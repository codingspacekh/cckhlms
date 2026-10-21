import Link from 'next/link';
import { cache } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { getClass } from '@/modules/academics/classes';
import { pageData, requireActor } from '@/server/guard';

// Once per request: the class layout and the section page both load it.
const loadClass = cache(async (id: string) => {
  const actor = await requireActor('teacher.area');
  const c = await pageData(getClass(actor, id));
  return { actor, c };
});

// Shared by the sections of a teacher's class (Weeks, Students, Syllabus, Schedule), which the sidebar lists.
export async function teacherClass(params: Promise<{ id: string }>) {
  return loadClass((await params).id);
}

export function ClassHeader({ name }: { name: string }) {
  return <PageHeader eyebrow={<Link href="/teacher">My classes</Link>} title={name} />;
}
