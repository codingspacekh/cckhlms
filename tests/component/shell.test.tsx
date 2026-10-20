// Dashboard shell from the approved P0 design (docs/05 M1).
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/shell/Sidebar';
import { Pill } from '@/components/ui/Pill';
import { NAV } from '@/components/shell/nav';

let pathname = '/admin';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
afterEach(() => {
  cleanup();
  pathname = '/admin';
});

describe('Sidebar', () => {
  it('shows the navigation for the role and marks the current page', () => {
    render(<Sidebar role="admin" user={{ name: 'Club Admin', roleLabel: 'Admin' }} />);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    for (const section of NAV.admin)
      for (const item of section.items) expect(within(nav).getByRole('link', { name: item.label })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe('page');
  });

  it('lists a teacher’s classes; the open class shows its sections with the current one marked', () => {
    pathname = '/teacher/classes/c1/students';
    const classes = [
      { id: 'c1', name: 'Python Level 1 · Sat 09:00' },
      { id: 'c2', name: 'Java Level 2 · Sat 14:00' },
    ];
    render(<Sidebar role="teacher" user={{ name: 'Sophea Chan', roleLabel: 'Teacher' }} classes={classes} />);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getByRole('link', { name: 'Java Level 2 · Sat 14:00' }).getAttribute('href')).toBe('/teacher/classes/c2');
    const open = within(nav).getByRole('group', { name: 'Python Level 1 · Sat 09:00 sections' });
    expect(
      within(open)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('aria-current')]),
    ).toEqual([
      ['Weeks', '/teacher/classes/c1', null],
      ['Gradebook', '/teacher/classes/c1/gradebook', null],
      ['Term reports', '/teacher/classes/c1/reports', null],
      ['Students', '/teacher/classes/c1/students', 'page'],
      ['Syllabus', '/teacher/classes/c1/syllabus', null],
      ['Schedule', '/teacher/classes/c1/schedule', null],
    ]);
    expect(within(nav).queryByRole('group', { name: 'Java Level 2 · Sat 14:00 sections' })).toBeNull();
  });

  it('shows who is signed in and a sign-out button', () => {
    render(<Sidebar role="student" user={{ name: 'Bopha Lim', roleLabel: 'Student' }} />);
    expect(screen.getByText('Bopha Lim')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });
});

describe('Pill', () => {
  it('never shows status by colour alone: it always has a text label and an icon', () => {
    render(
      <Pill tone="bad" icon="alert">
        Report missing
      </Pill>,
    );
    const pill = screen.getByText('Report missing').closest('.pill')!;
    expect(pill.className).toContain('bad');
    expect(pill.querySelector('svg')).toBeTruthy();
  });
});
