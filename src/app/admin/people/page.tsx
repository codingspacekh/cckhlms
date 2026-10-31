import type { Metadata } from 'next';
import Link from 'next/link';
import { getClubSettings } from '@/modules/club/service';
import { importTargets } from '@/modules/identity/batches';
import { listPeople, type Role } from '@/modules/identity/service';
import { LMS_ORIGIN } from '@/server/auth';
import { requireActor } from '@/server/guard';
import { PeopleManager } from './PeopleManager';

export const metadata: Metadata = { title: 'People' };
const TABS: { role: Role; label: string }[] = [
  { role: 'student', label: 'Students' },
  { role: 'teacher', label: 'Teachers' },
  { role: 'admin', label: 'Admins' },
];

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ role?: string; show?: string; import?: string }> }) {
  const actor = await requireActor('accounts.manage');
  const { role: requested, show, import: startImport } = await searchParams;
  const role: Role = TABS.some((t) => t.role === requested) ? (requested as Role) : 'student';
  const [people, { clubName }, targets] = await Promise.all([listPeople(actor, role), getClubSettings(), importTargets(actor)]);
  const tabs = (
    <nav className="tabs" aria-label="Kind of account">
      {TABS.map((t) => (
        <Link key={t.role} href={`/admin/people?role=${t.role}`} aria-current={t.role === role ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
  return (
    <PeopleManager
      people={people}
      role={role}
      show={show === 'archived' ? 'archived' : 'active'}
      selfId={actor.userId}
      tabs={tabs}
      clubName={clubName}
      site={new URL(LMS_ORIGIN).host}
      importTargets={targets}
      startImport={startImport === '1'}
    />
  );
}
