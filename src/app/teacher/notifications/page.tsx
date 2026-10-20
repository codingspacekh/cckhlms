import type { Metadata } from 'next';
import { NotificationsView } from '@/components/notifications/NotificationsView';
import { requireActor } from '@/server/guard';

export const metadata: Metadata = { title: 'Notifications' };

export default async function TeacherNotificationsPage() {
  return <NotificationsView actor={await requireActor('teacher.area')} area="teacher" />;
}
