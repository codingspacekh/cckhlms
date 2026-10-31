// BR-29 (owner, 2026-11-01): a teacher's support lines on Today are one compact card, a row per line (when, their
// own students with class and latest note, Join on Zoom), instead of a big card each.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TeacherSupportLines } from '@/components/support/SupportLineCards';

afterEach(cleanup);

const ZOOM = 'https://us06web.zoom.us/j/89990001112';
const lines = [
  {
    id: 'l1',
    date: '2027-01-14',
    startTime: '18:00',
    minutes: 60,
    meetingUrl: ZOOM,
    message: 'Bring your Week 3 program.',
    students: [
      { name: 'Leakena Som', className: 'Python Level 1 · Sat 09:00', note: 'Missed the loops lesson.' },
      { name: 'Rotanak Ry', className: 'Python Level 1 · Sat 09:00', note: null },
    ],
    others: 2,
  },
  {
    id: 'l2',
    date: '2027-01-19',
    startTime: '17:30',
    minutes: 90,
    meetingUrl: `${ZOOM}9`,
    message: '',
    students: [{ name: 'Dara Sok', className: 'Web Basics · Sun 10:00', note: null }],
    others: 0,
  },
];

describe('TeacherSupportLines', () => {
  it('is one card with a row for each line', () => {
    render(<TeacherSupportLines lines={lines} today="2027-01-13" />);
    const card = screen.getByRole('region', { name: 'Support lines' });
    const rows = within(card).getAllByRole('listitem', { name: /support line$/ });
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Tomorrow · 18:00–19:00 support line',
      'Tue 19 Jan · 17:30–19:00 support line',
    ]);
    expect(
      within(card)
        .getAllByRole('link', { name: /Join on Zoom/ })
        .map((a) => a.getAttribute('href')),
    ).toEqual([ZOOM, `${ZOOM}9`]);
  });

  it('names only the teacher’s own students, with their class and latest note, and counts the others', () => {
    render(<TeacherSupportLines lines={lines} today="2027-01-13" />);
    const first = within(screen.getAllByRole('listitem', { name: /support line$/ })[0]!);
    expect(first.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Leakena Som Python Level 1 · Missed the loops lesson.',
      'Rotanak Ry Python Level 1',
    ]);
    expect(first.getByText('and 2 students from other classes')).toBeTruthy();
    expect(first.getByText('Message to students: “Bring your Week 3 program.”')).toBeTruthy();
  });

  it('shows nothing without support lines', () => {
    const { container } = render(<TeacherSupportLines lines={[]} today="2027-01-13" />);
    expect(container.innerHTML).toBe('');
  });
});
