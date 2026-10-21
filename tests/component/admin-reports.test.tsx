// FR-ADM-09/10 · BR-10: the admin dashboard's "needs attention" list and the admin's student report.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminDashboardView } from '@/components/reporting/AdminDashboardView';
import { AdminStudentReportView } from '@/components/reporting/AdminStudentReportView';
import type { AdminDashboard } from '@/modules/reporting/dashboard';
import type { AdminStudentReport } from '@/modules/reporting/student-report';

afterEach(cleanup);

const dashboard: AdminDashboard = {
  today: '2027-01-20',
  tiles: { activeClasses: 1, students: 3, classPlaces: 3, attendance: 83, needSupport: 1 },
  bands: [
    { label: 'Below 50', count: 1 },
    { label: '50–59', count: 0 },
    { label: '60–69', count: 0 },
    { label: '70–79', count: 2 },
    { label: '80–89', count: 0 },
    { label: '90–100', count: 0 },
  ],
  weekend: [
    {
      classId: 'c1',
      className: 'Python Level 1 · Sat 09:00',
      date: '2027-01-23',
      startTime: '09:00',
      endTime: '10:30',
      room: 'Room A',
      week: 3,
    },
  ],
  classes: [
    {
      classId: 'c1',
      className: 'Python Level 1 · Sat 09:00',
      teacher: 'Sophea Chan',
      students: 3,
      passMark: 60,
      attendance: 83,
      average: 61.7,
    },
  ],
  attention: {
    support: [{ studentId: 's2', name: 'Chenda Ouk', className: 'Python Level 1 · Sat 09:00', note: 'Extra help with loops' }],
    missingReports: [
      { classId: 'c1', className: 'Python Level 1 · Sat 09:00', week: 2, date: '2027-01-16', teacher: 'Sophea Chan' },
      { classId: 'c1', className: 'Python Level 1 · Sat 09:00', week: 3, date: '2027-01-23', teacher: 'Sophea Chan' },
    ],
    lowAttendance: [{ studentId: 's3', name: 'Kosal Meas', className: 'Python Level 1 · Sat 09:00', percent: 50 }],
  },
};

describe('AdminDashboardView', () => {
  it('lists what needs attention: support flags, missing weekly reports (one line per class), low attendance', () => {
    render(<AdminDashboardView d={dashboard} />);
    const list = screen.getByRole('region', { name: 'Needs attention' });
    expect(list.textContent).toContain('Chenda OukNeeds supportPython Level 1 · Sat 09:00: Extra help with loops');
    expect(within(list).getByRole('link', { name: 'Open report for Chenda Ouk' }).getAttribute('href')).toBe('/admin/students/s2');
    expect(list.textContent).toContain('Sophea Chan · weeks 2, 32 reports missing');
    expect(list.textContent).toContain('Kosal MeasPython Level 1 · Sat 09:00Attendance 50%');
  });

  it('the tiles, this weekend and the classes table', () => {
    render(<AdminDashboardView d={dashboard} />);
    expect(screen.getByRole('region', { name: 'This weekend' }).textContent).toContain('Sat 23 Jan 2027 · 09:00–10:30 · Room A');
    expect(screen.getByRole('row', { name: /Python Level 1/ }).textContent).toContain('Python Level 1 · Sat 09:00Sophea Chan383%61.7');
  });

  it('says so when nothing needs attention', () => {
    render(<AdminDashboardView d={{ ...dashboard, attention: { support: [], missingReports: [], lowAttendance: [] } }} />);
    expect(screen.getByText('Nothing needs attention right now.')).toBeTruthy();
  });
});

const standing = {
  studentId: 's1',
  enrolmentId: 'e1',
  name: 'Bopha Lim',
  enrolledOn: '2027-01-20',
  overall: { overall: 70, exam: null, classwork: 70, homework: null },
  suggested: 'pass' as const,
  attendance: { percent: 100, present: 2, late: 0, absent: 0, excused: 0, held: 2 },
  homework: { handedIn: 0, expected: 0, percent: null },
};
const report: AdminStudentReport = {
  student: { id: 's1', name: 'Bopha Lim', username: 'bopha.l', erasedAt: null },
  classes: [
    {
      classId: 'c1',
      className: 'Python Level 1 · Sat 09:00',
      termName: 'Term 1 · 2027',
      status: 'active',
      current: true,
      enrolledOn: '2027-01-20',
      classStart: '2027-01-09',
      passMark: 60,
      standing,
      tasks: [
        { id: 'a', title: 'Quiz 1', kind: 'classwork', week: 1, maxScore: 10, state: 'graded', late: false, percent: 50 },
        { id: 'b', title: 'Quiz 2', kind: 'classwork', week: 2, maxScore: 10, state: 'graded', late: true, percent: 90 },
      ],
      improvement: { change: 40, window: 1 },
      report: {
        status: 'draft',
        rating: 'good',
        comment: 'Keep going.',
        needsSupport: true,
        supportNote: 'Loops',
        result: null,
        score: null,
      },
    },
  ],
  terms: [
    { termName: 'Term 3 · 2026', score: 65, change: null },
    { termName: 'Term 4 · 2026', score: 72, change: 7 },
  ],
};

describe('AdminStudentReportView', () => {
  it('each class: standing with improvement, attendance, homework, scores by task, the term report with support', () => {
    render(<AdminStudentReportView r={report} />);
    const c = screen.getByRole('region', { name: 'Python Level 1 · Sat 09:00' });
    expect(c.textContent).toContain('+40.0 points: the last 1 score against the one before');
    expect(c.textContent).toContain('2 present · 0 late · 0 absent · 0 excused');
    expect(c.textContent).toContain('Quiz 2 Classwork · late90%');
    expect(c.textContent).toContain('Joined on 20 Jan 2027');
    const term = within(c).getByRole('region', { name: 'Term report: Python Level 1 · Sat 09:00' });
    expect(term.textContent).toContain('Draft');
    expect(term.textContent).toContain('Needs support. Loops');
  });

  it('final scores term by term, with the change on the term before (BR-10)', () => {
    render(<AdminStudentReportView r={report} />);
    expect(screen.getByRole('region', { name: 'Final scores by term' }).textContent).toBe(
      'Final scores by termTerm 3 · 202665.0Term 4 · 202672.0+7.0 on the term before',
    );
  });

  it('no late-joining note for a student there from the start', () => {
    render(<AdminStudentReportView r={{ ...report, classes: [{ ...report.classes[0]!, enrolledOn: '2027-01-09' }] }} />);
    expect(screen.queryByText(/Joined on/)).toBeNull();
  });
});
