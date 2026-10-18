// Dashboard shell from the approved P0 design (docs/05 M1).
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/shell/Sidebar';
import { Pill } from '@/components/ui/Pill';
import { NAV } from '@/components/shell/nav';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }));
afterEach(cleanup);

describe('Sidebar', () => {
  it('shows the navigation for the role and marks the current page', () => {
    render(<Sidebar role="admin" user={{ name: 'Club Admin', roleLabel: 'Admin' }} />);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    for (const section of NAV.admin)
      for (const item of section.items) expect(within(nav).getByRole('link', { name: item.label })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe('page');
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
