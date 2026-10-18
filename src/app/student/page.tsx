import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'My week' };

export default async function StudentHome() {
  const actor = await requireActor('student.area');
  return (
    <>
      <PageHeader eyebrow="My week" title={`Hi ${actor.name.split(' ')[0]}`} />
      <section className="card">
        <h2>Your classes and homework</h2>
        <p className="small muted">Your classes, lessons and homework will appear here.</p>
      </section>
      <p className="xs muted">
        On a shared club laptop you&apos;ll be signed out after 2 hours without activity. Always sign out when you finish.
      </p>
    </>
  );
}
