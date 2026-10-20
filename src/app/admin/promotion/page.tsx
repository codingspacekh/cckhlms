import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pill } from '@/components/ui/Pill';
import { TableScroll } from '@/components/ui/TableScroll';
import { formatDate, todayIn } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import { promotionList, type PromotionListRow } from '@/modules/promotion/promotion';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Promotion' };

function State({ c, tz }: { c: PromotionListRow; tz: string }) {
  if (c.promotedAt)
    return (
      <Pill tone="good" icon="check">
        Promoted {formatDate(todayIn(tz, c.promotedAt))}
      </Pill>
    );
  if (c.students === 0) return <Pill>No students</Pill>;
  if (c.published < c.students)
    return (
      <Pill tone="warn" icon="alert">
        Term reports not published
      </Pill>
    );
  return <Pill tone="info">Ready</Pill>;
}

// FR-ADM-13: the end of term, class by class. Each class opens its promotion wizard.
export default async function PromotionPage() {
  const actor = await requireActor('classes.manage');
  const [classes, { timeZone }] = await Promise.all([promotionList(actor), getClubSettings()]);
  return (
    <>
      <PageHeader eyebrow="Term" title="Promotion" />
      <p className="small muted">
        When a class&apos;s term reports are published, move its students on: passed students to the next level, the others to a repeat
        class. The old class is archived with all its data.
      </p>
      <section className="card flush" aria-label="Classes to promote">
        <TableScroll label="Classes to promote table">
          <table>
            <thead>
              <tr>
                <th scope="col">Class</th>
                <th scope="col">Term</th>
                <th scope="col" className="n">
                  Reports published
                </th>
                <th scope="col">State</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {classes.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No term has started yet.
                  </td>
                </tr>
              )}
              {classes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link className="strong" href={`/admin/classes/${c.id}`}>
                      {c.name}
                    </Link>
                  </td>
                  <td>{c.termName}</td>
                  <td className="n tnum">
                    {c.published} of {c.students}
                  </td>
                  <td>
                    <State c={c} tz={timeZone} />
                  </td>
                  <td>
                    <div className="row end nowrap">
                      {!c.promotedAt && c.students > 0 && (
                        <Link className="btn sm" href={`/admin/classes/${c.id}/promote`}>
                          Open wizard
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>
    </>
  );
}
