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
        { href: '/admin/people', label: 'People', icon: 'users' },
        { href: '/admin/settings', label: 'Settings', icon: 'settings' },
      ],
    },
  ],
  teacher: [{ title: 'Teaching', items: [{ href: '/teacher', label: 'Dashboard', icon: 'home' }] }],
  student: [{ title: 'Learning', items: [{ href: '/student', label: 'My week', icon: 'home' }] }],
};
