import type { Metadata } from 'next';
import Link from 'next/link';
import { listPeople, type Role } from '@/modules/identity/service';
import { requireActor } from '@/server/guard';
import { PeopleManager } from './PeopleManager';

export const metadata: Metadata = { title: 'People' };
const TABS: { role: Role; label: string }[] = [
  { role: 'student', label: 'Students' },
  { role: 'teacher', label: 'Teachers' },
  { role: 'admin', label: 'Admins' },
];

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const actor = await requireActor('accounts.manage');
  const { role: requested } = await searchParams;
  const role: Role = TABS.some((t) => t.role === requested) ? (requested as Role) : 'student';
  const people = await listPeople(actor, role);
  const tabs = (
    <nav className="tabs" aria-label="Kind of account">
      {TABS.map((t) => (
        <Link key={t.role} href={`/admin/people?role=${t.role}`} aria-current={t.role === role ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
  return <PeopleManager people={people} role={role} selfId={actor.userId} tabs={tabs} />;
}
