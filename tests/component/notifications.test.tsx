// FR-SYS-01 · FR-STU-09: the bell in the top bar and the notifications page. Opening the page marks it read up to
// the newest notification shown; the ones that were new keep their "New" mark while the page is open.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const markSeenAction = vi.fn();
vi.mock('@/modules/notifications/actions', () => ({ markSeenAction: (...a: unknown[]) => markSeenAction(...a) }));
const { Bell } = await import('@/components/shell/Bell');
const { NotificationList } = await import('@/components/notifications/NotificationList');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const items = [
  {
    id: 'due:w1',
    kind: 'due_soon' as const,
    at: '2027-01-15T02:00:00.000Z',
    when: 'Fri 15 Jan 2027, 09:00',
    title: 'Due soon: Countdown',
    detail: 'Due Sat 16 Jan 2027, 09:00',
    href: '/student/classes/c1/work/w1',
    className: 'Python Level 1 · Sat 09:00',
    unread: true,
  },
  {
    id: 'lesson:l1',
    kind: 'lesson' as const,
    at: '2027-01-09T03:00:00.000Z',
    when: 'Sat 9 Jan 2027, 10:00',
    title: 'New lesson: Week 1 · Variables',
    detail: '',
    href: '/student/classes/c1/weeks/1',
    className: 'Python Level 1 · Sat 09:00',
    unread: false,
  },
];

describe('Bell', () => {
  it('links to the notifications and says how many are new', () => {
    render(<Bell href="/student/notifications" unread={3} />);
    const bell = screen.getByRole('link', { name: 'Notifications, 3 new' });
    expect(bell.getAttribute('href')).toBe('/student/notifications');
    expect(bell.textContent).toBe('3');
  });

  it('shows no number when nothing is new, and 9+ for many', () => {
    render(<Bell href="/student/notifications" unread={0} />);
    expect(screen.getByRole('link', { name: 'Notifications' }).textContent).toBe('');
    cleanup();
    render(<Bell href="/student/notifications" unread={12} />);
    expect(screen.getByRole('link', { name: 'Notifications, 12 new' }).textContent).toBe('9+');
  });
});

describe('NotificationList', () => {
  it('lists each notification as a link, newest first, marking the new ones', () => {
    markSeenAction.mockResolvedValue({ ok: true });
    render(<NotificationList area="student" items={items} />);
    const list = screen.getAllByRole('listitem');
    expect(list).toHaveLength(2);
    const link = within(list[0]!).getByRole('link', { name: /Due soon: Countdown/ });
    expect(link.getAttribute('href')).toBe('/student/classes/c1/work/w1');
    expect(within(list[0]!).getByText('New')).toBeTruthy();
    expect(list[0]!.textContent).toContain('Python Level 1 · Sat 09:00 · Fri 15 Jan 2027, 09:00');
    expect(list[0]!.textContent).toContain('Due Sat 16 Jan 2027, 09:00');
    expect(within(list[1]!).queryByText('New')).toBeNull();
  });

  it('marks the area read up to the newest one, once, and keeps the New marks', async () => {
    markSeenAction.mockResolvedValue({ ok: true });
    const { rerender } = render(<NotificationList area="student" items={items} />);
    await waitFor(() => expect(markSeenAction).toHaveBeenCalledWith('student', '2027-01-15T02:00:00.000Z'));
    rerender(<NotificationList area="student" items={items.map((i) => ({ ...i, unread: false }))} />); // after the refresh
    expect(within(screen.getAllByRole('listitem')[0]!).getByText('New')).toBeTruthy();
    expect(markSeenAction).toHaveBeenCalledTimes(1);
  });

  it('says when there is nothing, and marks nothing', () => {
    render(<NotificationList area="teacher" items={[]} />);
    expect(screen.getByText('Nothing new in the last 14 days.')).toBeTruthy();
    expect(markSeenAction).not.toHaveBeenCalled();
  });
});
