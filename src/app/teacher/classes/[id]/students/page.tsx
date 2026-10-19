import type { Metadata } from 'next';
import { RosterTable } from '@/components/academics/RosterTable';
import { listRoster } from '@/modules/academics/enrolments';
import { classAttendance } from '@/modules/attendance/attendance';
import { ClassHeader, teacherClass } from '../class-page';

export const metadata: Metadata = { title: 'Students' };

// The class's students with their attendance so far (BR-09).
export default async function ClassStudentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, c } = await teacherClass(params);
  const [roster, rates] = await Promise.all([listRoster(actor, c.id), classAttendance(actor, c.id)]);
  const attendance = new Map([...rates].map(([enrolmentId, r]) => [enrolmentId, r.percent]));
  return (
    <>
      <ClassHeader name={c.name} />
      <section className="stack" aria-labelledby="students-title">
        <h2 id="students-title">Students</h2>
        <div className="card flush">
          <RosterTable rows={roster} attendance={attendance} />
        </div>
      </section>
    </>
  );
}
