// FR-ADM-07 · BR-18: the class roster keeps students who left as history.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RosterTable } from '@/components/academics/RosterTable';
import { sessionWhen } from '@/components/academics/nextSessionText';
import type { RosterRow } from '@/modules/academics/enrolments';

afterEach(cleanup);
const rows: RosterRow[] = [
  {
    id: 'e1',
    studentId: 's1',
    name: 'Bopha Lim',
    username: 'bopha.l',
    status: 'active',
    enrolledOn: '2027-01-20',
    endedOn: null,
    transferredFrom: 'Web Basics · Sat 10:00',
  },
  {
    id: 'e2',
    studentId: 's2',
    name: 'Rithy Som',
    username: 'rithy.s',
    status: 'withdrawn',
    enrolledOn: '2027-01-09',
    endedOn: '2027-02-01',
    transferredFrom: null,
  },
];

describe('RosterTable', () => {
  it('shows active students and students who left, with dates and where they came from', () => {
    render(<RosterTable rows={rows} />);
    const active = screen.getByRole('row', { name: /Bopha Lim/ });
    expect(active.textContent).toContain('20 Jan 2027');
    expect(active.textContent).toContain('Moved from Web Basics · Sat 10:00');
    expect(within(active).getByText('Active')).toBeTruthy();
    expect(screen.getByRole('row', { name: /Rithy Som/ }).textContent).toContain('Left 1 Feb 2027');
  });

  it('only offers actions for students who are still in the class', () => {
    render(<RosterTable rows={rows} actions={(r) => <button>Withdraw {r.name}</button>} />);
    expect(screen.getByRole('button', { name: 'Withdraw Bopha Lim' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Withdraw Rithy Som' })).toBeNull();
  });

  it('says so when there are no students yet', () => {
    render(<RosterTable rows={[]} actions={() => null} />);
    expect(screen.getByText('No students yet.')).toBeTruthy();
  });
});

describe('sessionWhen', () => {
  it('writes the date and the time span', () => {
    expect(sessionWhen({ date: '2028-04-15', startTime: '09:00' }, 90)).toBe('Sat 15 Apr 2028 · 09:00–10:30');
  });
});
