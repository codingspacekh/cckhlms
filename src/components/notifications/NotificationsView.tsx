import { PageHeader } from '@/components/ui/PageHeader';
import { formatDate, toClubTime } from '@/modules/academics/schedule';
import { getClubSettings } from '@/modules/club/service';
import { notificationsFor } from '@/modules/notifications/notifications';
import { WINDOW_DAYS, type Area } from '@/modules/notifications/rules';
import type { Actor } from '@/server/actor';
import { NotificationList } from './NotificationList';

// The notifications page of the student or teacher area (FR-SYS-01, FR-STU-09).
export async function NotificationsView({ actor, area }: { actor: Actor; area: Area }) {
  const [{ items }, { timeZone }] = await Promise.all([notificationsFor(actor, area), getClubSettings()]);
  const when = (at: Date) => {
    const t = toClubTime(at, timeZone);
    return `${formatDate(t.date)}, ${t.time}`;
  };
  return (
    <>
      <PageHeader eyebrow={`The last ${WINDOW_DAYS} days`} title="Notifications" />
      <NotificationList area={area} items={items.map((n) => ({ ...n, at: n.at.toISOString(), when: when(n.at) }))} />
    </>
  );
}
