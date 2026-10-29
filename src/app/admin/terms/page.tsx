import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { listTerms } from '@/modules/academics/terms';
import { requireActor } from '@/server/guard';
import { TermsManager } from './TermsManager';

export const metadata: Metadata = { title: 'Terms' };

export default async function TermsPage() {
  const actor = await requireActor('terms.manage');
  const terms = await listTerms(actor);
  return (
    <>
      <PageHeader eyebrow="Club" title="Terms" />
      <TermsManager
        terms={terms.map((t) => ({
          id: t.id,
          year: t.year,
          number: t.number,
          name: t.name,
          startDate: t.startDate,
          endDate: t.endDate,
          status: t.status,
        }))}
      />
    </>
  );
}
