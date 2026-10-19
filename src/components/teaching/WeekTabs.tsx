'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// The sections of a teacher's week, in the order of the P0 prototype.
const TABS = [
  { path: '', label: 'Lesson note' },
  { path: '/attendance', label: 'Attendance' },
  { path: '/work', label: 'Classwork & homework' },
  { path: '/questions', label: 'Questions' },
  { path: '/report', label: 'Weekly report' },
];

export function WeekTabs({ base }: { base: string }) {
  const pathname = usePathname();
  return (
    <nav className="tabs" aria-label="This week">
      {TABS.map((t) => (
        <Link key={t.path} href={`${base}${t.path}`} aria-current={pathname === `${base}${t.path}` ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
