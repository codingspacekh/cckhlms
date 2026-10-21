import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

// The notifications button in the top bar (FR-SYS-01), with how many are new.
export function Bell({ href, unread }: { href: string; unread: number }) {
  return (
    <Link className="bell" href={href} aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'} title="Notifications">
      <Icon name="bell" />
      {unread > 0 && (
        <span className="bell-count" aria-hidden="true">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}
