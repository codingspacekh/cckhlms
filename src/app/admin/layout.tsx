import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/AppShell';
import { requireActor } from '@/server/guard';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor('admin.area');
  return (
    <AppShell role="admin" name={actor.name} crumb="Admin">
      {children}
    </AppShell>
  );
}
