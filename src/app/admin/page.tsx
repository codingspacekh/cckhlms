import type { Metadata } from 'next';
import Link from 'next/link';
import { TermWeeks } from '@/components/home/TermWeeks';
import { AdminDashboardView } from '@/components/reporting/AdminDashboardView';
import { Icon } from '@/components/ui/Icon';
import { formatDate, formatDayMonth, formatDay } from '@/modules/academics/schedule';
import { adminDashboard } from '@/modules/reporting/dashboard';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Dashboard' };

// FR-ADM-10: what's running, how it's going, and what needs attention, under a banner saying where the term is (M8).
export default async function AdminDashboard() {
  const actor = await requireActor('admin.area');
  const d = await adminDashboard(actor);
  const t = d.term;
  const left = t ? t.weeks - t.week : 0;
  return (
    <>
      <section className="hello term-banner" aria-labelledby="term-title">
        <div className="hello-text">
          <span className="eyebrow">{formatDate(d.today)}</span>
          <h1 id="term-title">{t ? `Term ${t.number} is in Week ${t.week}` : 'No term is running today'}</h1>
          <p className="lead">
            {t
              ? `${formatDayMonth(t.startDate)} – ${formatDay(t.endDate)} · ${left === 0 ? 'the last week' : `${left} ${left === 1 ? 'week' : 'weeks'} to go`}`
              : 'Set up the next term and its classes when you’re ready.'}
          </p>
          <div className="row">
            <Link className="btn primary" href="/admin/people">
              <Icon name="plus" />
              Add a person
            </Link>
            <Link className="btn" href={t ? '/admin/classes' : '/admin/terms'}>
              {t ? 'New class' : 'Terms'}
            </Link>
          </div>
        </div>
        {t && (
          <TermWeeks week={t.week} weeks={t.weeks} label={`Weeks of ${t.name}: ${t.week - 1} gone by, week ${t.week} now, ${left} to go`} />
        )}
      </section>
      <AdminDashboardView d={d} />
    </>
  );
}
