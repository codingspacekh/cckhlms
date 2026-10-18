import type { Metadata } from 'next';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { clubSettings, user } from '@/db/schema';
import { PageHeader } from '@/components/ui/PageHeader';
import { Tile } from '@/components/ui/Tile';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Dashboard' };

async function countRole(role: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(user)
    .where(sql`${role} = any(string_to_array(${user.role}, ','))`);
  return row?.n ?? 0;
}

export default async function AdminDashboard() {
  await requireActor('admin.area');
  const [admins, teachers, students, [settings]] = await Promise.all([
    countRole('admin'),
    countRole('teacher'),
    countRole('student'),
    db.select({ timeZone: clubSettings.timeZone }).from(clubSettings).limit(1),
  ]);
  return (
    <>
      <PageHeader eyebrow="Club overview" title="Dashboard" />
      <div className="grid g4">
        <Tile label="Admins" value={admins} />
        <Tile label="Teachers" value={teachers} />
        <Tile label="Students" value={students} />
        <Tile label="Club time zone" value={settings?.timeZone ?? '—'} note="All dates and due times use this" />
      </div>
      <section className="card">
        <h2>Coming next</h2>
        <p className="small muted">Classes, people and terms arrive in M2. Lessons, attendance and homework follow in M3 and M4.</p>
      </section>
    </>
  );
}
