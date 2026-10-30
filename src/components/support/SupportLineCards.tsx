import { JoinZoom } from '@/components/academics/Where';
import { TableScroll } from '@/components/ui/TableScroll';
import { addDays } from '@/modules/academics/schedule';
import { firstName } from '@/modules/reporting/home-rules';
import { supportWhen } from '@/modules/support/rules';
import type { StudentSupportLine, TeacherSupportLine } from '@/modules/support/support-lines';

// "Thu 21 Jan · 18:00–19:00", or "Today · …" / "Tomorrow · …".
function longWhen(l: { date: string; startTime: string; minutes: number }, today: string) {
  const when = supportWhen(l);
  if (l.date === today) return when.replace(/^[^·]+· /, 'Today · ');
  if (l.date === addDays(today, 1)) return when.replace(/^[^·]+· /, 'Tomorrow · ');
  return when;
}

// A student's invitation on My week (FR-STU-13, BR-29; prototype screen 7). It doesn't say why, or who else is in it.
export function StudentSupportCard({ line, today }: { line: StudentSupportLine; today: string }) {
  const teachers = line.teachers.map((t) => `Teacher ${firstName(t)}`);
  return (
    <section className="card stack invite wide" aria-labelledby={`sl-${line.id}`}>
      <span className="tag">Support line</span>
      <h2 id={`sl-${line.id}`}>You’re invited to an extra help session</h2>
      <p className="when tnum">{longWhen(line, today)}</p>
      <p className="small muted">
        Online on Zoom · with {teachers.length ? `${teachers.join(' and ')} and the club team` : 'the club team'}
      </p>
      {line.message && <p className="prewrap">{line.message}</p>}
      <div className="row">
        <JoinZoom href={line.meetingUrl} size="lg" />
      </div>
    </section>
  );
}

// A teacher's card on Today (BR-29; prototype screen 8): only their own students are named.
export function TeacherSupportCard({ line, today }: { line: TeacherSupportLine; today: string }) {
  const n = line.students.length;
  return (
    <section className="card stack invite wide" aria-labelledby={`sl-${line.id}`}>
      <span className="tag">Support line · set up by Admin</span>
      <h2 id={`sl-${line.id}`}>
        {n} of your {n === 1 ? 'students has' : 'students have'} a support line
      </h2>
      <p className="when tnum">{longWhen(line, today)}</p>
      <TableScroll label="Your students in this support line, table">
        <table className="list" aria-label="Your students in this support line">
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">Class</th>
              <th scope="col">Latest note</th>
            </tr>
          </thead>
          <tbody>
            {line.students.map((s) => (
              <tr key={`${s.name}-${s.className}`}>
                <th scope="row">{s.name}</th>
                <td>{s.className.split(' · ')[0]}</td>
                <td className="text-cell small">{s.note ?? <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {line.others > 0 && (
        <p className="small muted">
          And {line.others} {line.others === 1 ? 'student' : 'students'} from other classes.
        </p>
      )}
      <div className="row">
        <JoinZoom href={line.meetingUrl} />
        {line.message && <span className="small muted">Message to students: “{line.message}”</span>}
      </div>
    </section>
  );
}
