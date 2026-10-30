import type { Metadata } from 'next';
import { JoinZoom } from '@/components/academics/Where';
import { WeeksTable } from '@/components/teaching/WeeksTable';
import { listRoster } from '@/modules/academics/enrolments';
import { scheduleLabel } from '@/modules/academics/schedule';
import { classWeeks } from '@/modules/teaching/lessons';
import { ClassHeader, teacherClass } from './class-page';

export const metadata: Metadata = { title: 'Weeks' };

// A teacher's class opens on its weeks: open one to write the lesson, take attendance, answer questions and
// write the report. Students, syllabus coverage and the schedule are the other sections in the sidebar.
export default async function ClassWeeksPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, c } = await teacherClass(params);
  const [roster, weeks] = await Promise.all([listRoster(actor, c.id), classWeeks(actor, c.id)]);
  return (
    <>
      <ClassHeader name={c.name} />
      <section className="card summary" aria-label="Class summary">
        <div>
          <span className="k">Schedule</span>
          <span>{scheduleLabel(c)}</span>
        </div>
        <div>
          <span className="k">Term</span>
          <span>{c.termName}</span>
        </div>
        <div>
          <span className="k">Where</span>
          <span>{c.mode === 'online' && c.meetingUrl ? <JoinZoom href={c.meetingUrl} size="sm" /> : (c.room ?? '—')}</span>
        </div>
        <div>
          <span className="k">Students</span>
          <span>{roster.filter((r) => r.status === 'active').length}</span>
        </div>
      </section>
      <section className="stack" aria-labelledby="weeks-title">
        <h2 id="weeks-title">Weeks</h2>
        <p className="small muted">Open a week to write the lesson, take attendance, answer questions and write the report.</p>
        <div className="card flush">
          <WeeksTable classId={c.id} weeks={weeks} />
        </div>
      </section>
    </>
  );
}
