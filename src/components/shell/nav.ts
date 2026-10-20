import type { IconName } from '@/components/ui/Icon';

export type Role = 'admin' | 'teacher' | 'student';
export type NavItem = { href: string; label: string; icon: IconName };
export type NavSection = { title: string; items: NavItem[] };

// Each milestone adds its pages here (M2: classes, people, terms …).
export const NAV: Record<Role, NavSection[]> = {
  admin: [
    { title: 'Overview', items: [{ href: '/admin', label: 'Dashboard', icon: 'home' }] },
    {
      title: 'Club',
      items: [
        { href: '/admin/classes', label: 'Classes', icon: 'layers' },
        { href: '/admin/people', label: 'People', icon: 'users' },
        { href: '/admin/terms', label: 'Terms', icon: 'calendar' },
        { href: '/admin/courses', label: 'Courses', icon: 'book' },
        { href: '/admin/settings', label: 'Settings', icon: 'settings' },
      ],
    },
  ],
  teacher: [{ title: 'Teaching', items: [{ href: '/teacher', label: 'Dashboard', icon: 'home' }] }],
  student: [
    {
      title: 'Learning',
      items: [
        { href: '/student', label: 'My week', icon: 'home' },
        { href: '/student/progress', label: 'My progress', icon: 'trend' },
      ],
    },
  ],
};

// A teacher's class opens in the sidebar as these sections (owner, 2026-10-19: sub-tabs instead of one long page).
// The week pages (lesson, attendance, questions, report) and each piece of work belong to Weeks.
export type ClassLink = { id: string; name: string };
export const CLASS_SECTIONS = [
  { path: '', label: 'Weeks' },
  { path: '/gradebook', label: 'Gradebook' },
  { path: '/stats', label: 'Statistics' },
  { path: '/reports', label: 'Term reports' },
  { path: '/students', label: 'Students' },
  { path: '/syllabus', label: 'Syllabus' },
  { path: '/schedule', label: 'Schedule' },
] as const;

export function classSectionActive(pathname: string, base: string, path: string) {
  if (path === '') return pathname === base || pathname.startsWith(`${base}/weeks`) || pathname.startsWith(`${base}/work/`);
  return pathname === base + path || pathname.startsWith(`${base + path}/`);
}
