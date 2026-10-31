import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { listLanguages } from '@/modules/academics/languages';
import { requireActor } from '@/server/guard';
import { CourseTabs } from '../CourseTabs';
import { LanguagesManager } from './LanguagesManager';

export const metadata: Metadata = { title: 'Languages' };

// M18a · BR-32: the languages a course can be taught in, and how students hand in work in each.
export default async function LanguagesPage() {
  const actor = await requireActor('courses.manage');
  const languages = await listLanguages(actor);
  return (
    <>
      <PageHeader eyebrow="Club" title="Courses" />
      <CourseTabs on="languages" />
      <LanguagesManager languages={languages} />
    </>
  );
}
