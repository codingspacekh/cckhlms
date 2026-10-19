'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// The sections of a teacher's week. Each milestone adds its tab here (M3: attendance, questions, report).
const TABS = [
  { path: '', label: 'Lesson note' },
  { path: '/attendance', label: 'Attendance' },
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
