import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { requireActor } from '@/server/guard';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor('admin.area');
  return (
    <AppShell role="admin" userId={actor.userId} name={actor.name} crumb="Admin">
      {children}
    </AppShell>
  );
}
