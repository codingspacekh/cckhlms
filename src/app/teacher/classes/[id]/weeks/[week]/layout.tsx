import Link from 'next/link';
import type { ReactNode } from 'react';
import { WeekTabs } from '@/components/teaching/WeekTabs';
import { PageHeader } from '@/components/ui/PageHeader';
import { addMinutes, formatDate } from '@/modules/academics/schedule';
import { teacherWeek } from '@/modules/teaching/weeks';
import { pageData, requireActor } from '@/server/guard';

// One week of a teacher's class: which week it is, the weeks either side, and its sections.
export default async function WeekLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string; week: string }> }) {
  const actor = await requireActor('teacher.area');
  const { id, week } = await params;
  const w = await pageData(teacherWeek(actor, id, Number(week)));
  const i = w.weeks.indexOf(w.week);
  const prev = w.weeks[i - 1];
  const next = w.weeks[i + 1];
  const base = `/teacher/classes/${id}/weeks/${w.week}`;
  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/teacher/classes/${id}`}>{w.className}</Link>}
        title={`Week ${w.week}`}
        actions={
          <nav className="row" aria-label="Other weeks">
            {prev && (
              <Link className="btn sm" href={`/teacher/classes/${id}/weeks/${prev}`}>
                ← Week {prev}
              </Link>
            )}
            {next && (
              <Link className="btn sm" href={`/teacher/classes/${id}/weeks/${next}`}>
                Week {next} →
              </Link>
            )}
          </nav>
        }
      />
      <p className="small muted tnum sub-head">
        {formatDate(w.date)} · {w.startTime}–{addMinutes(w.startTime, w.minutes)}
      </p>
      <WeekTabs base={base} />
      {children}
    </>
  );
}
