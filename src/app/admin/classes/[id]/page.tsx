import type { Metadata } from 'next';
import Link from 'next/link';
import { ArchivedNote } from '@/components/academics/ArchivedNote';
import { RosterTable } from '@/components/academics/RosterTable';
import { CoverageCard } from '@/components/teaching/CoverageCard';
import { PageHeader } from '@/components/ui/PageHeader';
import { getClass, listClasses, scheduleFixed } from '@/modules/academics/classes';
import { listCourses } from '@/modules/academics/courses';
import { listRoster } from '@/modules/academics/enrolments';
import { scheduleLabel, todayIn } from '@/modules/academics/schedule';
import { listTerms } from '@/modules/academics/terms';
import { getClubSettings } from '@/modules/club/service';
import { listPeople } from '@/modules/identity/service';
import { promotionUndo } from '@/modules/promotion/promotion';
import { syllabusCoverage } from '@/modules/teaching/reports';
import { pageData, requireActor } from '@/server/guard';
import { EditClass } from './EditClass';
import { RosterManager } from './RosterManager';
import { SessionsManager } from './SessionsManager';
import { UndoPromotion } from './UndoPromotion';

export const metadata: Metadata = { title: 'Class' };

export default async function ClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor('admin.area');
  const { id } = await params;
  const { undone } = await searchParams;
  const c = await pageData(getClass(actor, id));
  const [roster, people, termClasses, settings, coverage, courses, terms, fixed, undo] = await Promise.all([
    listRoster(actor, id),
    Promise.all([listPeople(actor, 'student'), listPeople(actor, 'teacher')]),
    listClasses(actor, { termId: c.termId }),
    getClubSettings(),
    syllabusCoverage(actor, id),
    listCourses(actor),
    listTerms(actor),
    scheduleFixed(actor, id),
    c.promotedAt ? promotionUndo(actor, id) : null,
  ]);
  const [students, teachers] = people;
  const inClass = new Set(roster.filter((r) => r.status === 'active').map((r) => r.studentId));
  const lead = c.teachers.find((t) => t.role === 'lead');
  const assistants = c.teachers.filter((t) => t.role === 'assistant');
  const archived = c.status === 'archived';
  // For Edit class: active teachers, and a switched-off one while they are still on the class.
  const classTeachers = teachers
    .filter((p) => p.active || c.teachers.some((t) => t.userId === p.id))
    .map((p) => ({ id: p.id, name: p.name }));
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/admin/classes">Classes</Link>}
        title={c.name}
        actions={
          <>
            <Link className="btn" href={`/admin/classes/${c.id}/reports`}>
              Term reports
            </Link>
            <Link className="btn" href={`/admin/classes/${c.id}/certificates`}>
              Certificates
            </Link>
            {!archived && (
              <EditClass
                klass={{
                  id: c.id,
                  name: c.name,
                  courseId: c.courseId,
                  termId: c.termId,
                  day: c.day,
                  startTime: c.startTime,
                  minutes: c.minutes,
                  firstDate: c.firstDate,
                  weeks: c.weeks,
                  mode: c.mode,
                  room: c.room,
                  meetingUrl: c.meetingUrl,
                  capacity: c.capacity,
                  leadTeacherId: lead?.userId ?? '',
                  assistantTeacherIds: assistants.map((a) => a.userId),
                }}
                fixed={fixed}
                courses={courses.map((k) => ({ id: k.id, label: `${k.code} · ${k.name}` }))}
                terms={terms.filter((t) => t.status !== 'closed' || t.id === c.termId).map((t) => ({ id: t.id, label: t.name }))}
                teachers={classTeachers}
              />
            )}
            {!archived && (
              <Link className="btn" href={`/admin/classes/${c.id}/slips`}>
                Login slips
              </Link>
            )}
            {!c.promotedAt && (
              <Link className="btn" href={`/admin/classes/${c.id}/promote`}>
                Promote
              </Link>
            )}
          </>
        }
      />
      {archived && <ArchivedNote termName={c.termName} timeZone={settings.timeZone} promotion={c.promotion} />}
      {undone && !c.promotedAt && (
        <p className="note" role="status">
          Promotion undone: every student is back in this class, which can be promoted again.
        </p>
      )}
      {undo && <UndoPromotion classId={c.id} className={c.name} state={undo} />}
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
          <span className="k">Course</span>
          <span>
            {c.courseCode} · {c.courseName}
          </span>
        </div>
        <div>
          <span className="k">Where</span>
          <span>
            {c.mode === 'online' && c.meetingUrl ? (
              <a href={c.meetingUrl} target="_blank" rel="noopener noreferrer">
                Online · Zoom link<span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              (c.room ?? '—')
            )}
          </span>
        </div>
        <div>
          <span className="k">Lead teacher</span>
          <span>{lead?.name ?? '—'}</span>
        </div>
        {assistants.length > 0 && (
          <div>
            <span className="k">Assistants</span>
            <span>{assistants.map((a) => a.name).join(', ')}</span>
          </div>
        )}
      </section>
      {archived ? (
        <section className="stack" aria-labelledby="students-title">
          <h2 id="students-title">Students</h2>
          <div className="card flush">
            <RosterTable rows={roster} />
          </div>
        </section>
      ) : (
        <RosterManager
          classId={c.id}
          roster={roster}
          candidates={students.filter((p) => p.active && !inClass.has(p.id)).map((p) => ({ id: p.id, name: p.name }))}
          otherClasses={termClasses.filter((k) => k.id !== c.id).map((k) => ({ id: k.id, name: k.name }))}
          today={todayIn(settings.timeZone)}
        />
      )}
      <CoverageCard coverage={coverage} />
      <h2>Sessions</h2>
      <SessionsManager
        classId={c.id}
        weeks={c.weeks}
        defaultStart={c.startTime}
        defaultMinutes={c.minutes}
        sessions={c.sessions}
        readOnly={archived}
      />
    </>
  );
}
