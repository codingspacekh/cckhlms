import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function TeacherDashboard() {
  const actor = await requireActor('teacher.area');
  return (
    <>
      <PageHeader eyebrow={`Welcome, ${actor.name}`} title="Dashboard" />
      <section className="card">
        <h2>Your classes</h2>
        <p className="small muted">Your classes will appear here once the club admin assigns you to one.</p>
      </section>
    </>
  );
}
