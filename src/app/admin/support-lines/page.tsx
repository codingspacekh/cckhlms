import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { listSupportLines, supportLineForm, type SupportLineRow } from '@/modules/support/support-lines';
import { requireActor } from '@/server/guard';
import { CancelLine } from './CancelLine';
import { NewSupportLine } from './NewSupportLine';

export const metadata: Metadata = { title: 'Support lines' };

const all = (v: string | string[] | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const one = (v: string | string[] | undefined) => all(v)[0];
const STATUS: Record<SupportLineRow['status'], ReactNode> = {
  upcoming: <Pill tone="info">Upcoming</Pill>,
  done: <Pill>Done</Pill>,
  cancelled: <Pill tone="warn">Cancelled</Pill>,
};
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

// Support lines (FR-ADM-18, BR-29; M14c): an extra online session for students who need help. New support line opens
// the form in a dialog; the students ticked on Weekly reports arrive in it (?students=…), and a line can be changed
// (?change=id) until it starts or copied for another day (?copy=id), each opening the dialog straight away.
export default async function SupportLinesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireActor('supportlines.manage');
  const q = await searchParams;
  const change = one(q.change);
  const copy = one(q.copy);
  const [form, lines] = await Promise.all([supportLineForm(actor, { picked: all(q.students), change, copy }), listSupportLines(actor)]);
  const done = one(q.made) ?? one(q.changed);
  const saved = done ? lines.find((l) => l.id === done) : undefined;
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/admin/weekly-reports">Weekly reports</Link>}
        title="Support lines"
        actions={
          <NewSupportLine
            key={[change, copy, ...all(q.students), done].join(',')}
            startOpen={!!(change || copy || all(q.students).length)}
            {...form}
          />
        }
      />
      <p className="small muted">
        An extra online session for students who need help, on any day agreed with their guardians. Its students see it on My week and their
        class teachers on Today, with a notification. Nothing is sent outside the app.
      </p>
      {saved && (
        <p className="note good" role="status">
          Support line {q.made ? 'made' : 'changed'} for {saved.when}. {count(saved.students.length, 'student')} and{' '}
          {count(saved.teachers.length, 'teacher')} ({saved.teachers.join(', ')}) can see it now on their home page and in notifications.
        </p>
      )}
      <section className="card flush" aria-labelledby="lines-title">
        <div className="chead">
          <h2 id="lines-title">Support lines</h2>
          <span className="small muted">Coming up, then the last 90 days</span>
        </div>
        {lines.length === 0 ? (
          <p className="muted pad">No support lines yet.</p>
        ) : (
          <TableScroll label="Support lines table">
            <table aria-label="Support lines">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Students</th>
                  <th scope="col">Teachers told</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <th scope="row" className="tnum">
                      {l.when}
                    </th>
                    <td className="text-cell">{l.students.join(', ')}</td>
                    <td className="text-cell">{l.teachers.join(', ')}</td>
                    <td>{STATUS[l.status]}</td>
                    <td>
                      <span className="row end">
                        {l.canChange && (
                          <>
                            <Link className="btn sm" href={`/admin/support-lines?change=${l.id}`}>
                              Change<span className="sr-only"> the support line on {l.when}</span>
                            </Link>
                            <CancelLine id={l.id} when={l.when} />
                          </>
                        )}
                        <Link className="btn sm ghost" href={`/admin/support-lines?copy=${l.id}`}>
                          Copy for another day<span className="sr-only"> ({l.when})</span>
                        </Link>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </section>
    </>
  );
}
