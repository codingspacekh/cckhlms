'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Pill } from '@/components/ui/Pill';
import { markSeenAction } from '@/modules/notifications/actions';
import type { Area, NotificationKind } from '@/modules/notifications/rules';

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  at: string; // ISO
  when: string; // in club time, for people
  title: string;
  detail: string;
  href: string;
  className: string;
  unread: boolean;
};

const ICON: Record<NotificationKind, IconName> = {
  lesson: 'book',
  work: 'layers',
  due_soon: 'clock',
  marked: 'check',
  returned: 'alert',
  reply: 'users',
  question: 'info',
  report: 'alert',
  to_mark: 'check',
};

// FR-SYS-01: opening the list marks the area read up to the newest notification shown. The "New" marks are kept
// from the first render, so they stay while the page is open even after the server says they're read.
export function NotificationList({ area, items }: { area: Area; items: NotificationItem[] }) {
  const [shown] = useState(items.map((i) => ({ ...i })));
  const marked = useRef(false);
  const newest = items[0]?.at;
  useEffect(() => {
    if (marked.current || !newest) return;
    marked.current = true;
    void markSeenAction(area, newest);
  }, [area, newest]);

  if (!items.length)
    return (
      <section className="card">
        <p className="muted">Nothing new in the last 14 days.</p>
      </section>
    );
  const unreadIds = new Set([...shown, ...items].filter((i) => i.unread).map((i) => i.id));
  return (
    <section className="card flush" aria-label="Notifications">
      <ul className="notes">
        {items.map((n) => (
          <li key={n.id} className={unreadIds.has(n.id) ? 'unread' : undefined}>
            <span className={`note-icon ${n.kind}`} aria-hidden="true">
              <Icon name={ICON[n.kind]} />
            </span>
            <div className="note-body">
              <Link href={n.href} className="strong">
                {n.title}
              </Link>
              {n.detail && <span className="small">{n.detail}</span>}
              <span className="xs muted">
                {n.className} · {n.when}
              </span>
            </div>
            {unreadIds.has(n.id) && <Pill tone="info">New</Pill>}
          </li>
        ))}
      </ul>
    </section>
  );
}
