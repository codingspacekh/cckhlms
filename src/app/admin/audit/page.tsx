import type { Metadata } from 'next';
import { AuditLogView } from '@/components/audit/AuditLogView';
import { PageHeader } from '@/components/ui/PageHeader';
import { formatDate, toClubTime } from '@/modules/academics/schedule';
import { auditEntries } from '@/modules/audit/audit-log';
import { parseAuditFilters } from '@/modules/audit/rules';
import { getClubSettings } from '@/modules/club/service';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Audit log' };

// FR-SYS-02 · NFR-11: who changed what, and when. Entries are only ever added; nobody can edit or delete them.
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireActor('audit.view');
  const filters = parseAuditFilters(await searchParams);
  const [{ rows, total, page }, { timeZone }] = await Promise.all([auditEntries(actor, filters), getClubSettings()]);
  return (
    <>
      <PageHeader eyebrow="Club" title="Audit log" />
      <p className="small muted">
        Changes to accounts, marks, results, promotions and certificates are recorded here as they happen, along with everyday changes to
        classes and teaching. Entries can’t be changed or deleted.
      </p>
      <AuditLogView
        rows={rows.map(({ at, ...r }) => {
          const t = toClubTime(at, timeZone);
          return { ...r, when: `${formatDate(t.date)}, ${t.time}` };
        })}
        total={total}
        filters={{ ...filters, page }}
      />
    </>
  );
}
