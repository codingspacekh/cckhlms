// FR-TCH-15/16/17 · BR-08 · BR-13: the class's Term reports tab: one line per student with the score, the suggested
// and chosen result, and a dialog to write the report; Publish sends them all; a published report can be changed
// only by the lead teacher or Admin, with a reason.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TermReportRow } from '@/modules/reporting/term-reports';

const saveTermReportAction = vi.fn();
const publishTermReportsAction = vi.fn();
vi.mock('@/modules/reporting/term-report-actions', () => ({
  saveTermReportAction: (...a: unknown[]) => saveTermReportAction(...a),
  publishTermReportsAction: (...a: unknown[]) => publishTermReportsAction(...a),
}));
const { TermReports } = await import('@/components/reporting/TermReports');

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const row = (over: Partial<TermReportRow>): TermReportRow => ({
  studentId: 's1',
  enrolmentId: 'e1',
  name: 'Bopha Lim',
  live: 72.5,
  calculated: 72.5,
  parts: { exam: 80, classwork: 70, homework: 50 },
  finalScore: null,
  score: 72.5,
  suggested: 'pass',
  rating: null,
  comment: '',
  needsSupport: false,
  supportNote: '',
  result: null,
  reason: null,
  status: 'none',
  publishedAt: null,
  ...over,
});
const rows = [
  row({}),
  row({
    studentId: 's2',
    enrolmentId: 'e2',
    name: 'Chenda Ouk',
    calculated: 55,
    score: 55,
    suggested: 'fail',
    rating: 'developing',
    result: 'pass',
    reason: 'Strong practical work',
    needsSupport: true,
    supportNote: 'Loops',
    status: 'draft',
  }),
];
const props = { classId: 'c1', passMark: 60, canWrite: true, canAmend: false, rows };
const dialog = () => screen.getByRole('dialog');

describe('TermReports', () => {
  it('shows one line per student: score, suggested and chosen result, rating, support and status', () => {
    render(<TermReports {...props} />);
    expect(screen.getByRole('row', { name: /Bopha Lim/ }).textContent).toBe('Bopha Lim72.5Pass———Not startedWrite');
    const chenda = screen.getByRole('row', { name: /Chenda Ouk/ });
    expect(chenda.textContent).toBe('Chenda Ouk55.0FailDevelopingNeeds supportPassNot suggestedDraftEdit');
  });

  it('writes a report in a dialog; the suggested result is chosen to start with', async () => {
    saveTermReportAction.mockResolvedValue({ ok: true, message: 'Report saved for Bopha Lim.' });
    render(<TermReports {...props} />);
    fireEvent.click(within(screen.getByRole('row', { name: /Bopha Lim/ })).getByRole('button', { name: /^Write/ }));
    expect(within(dialog()).getByText('Calculated 72.5 · exam 80.0 · classwork 70.0 · homework 50.0')).toBeTruthy();
    expect((within(dialog()).getByLabelText('Result') as HTMLSelectElement).value).toBe('pass');
    expect(within(dialog()).queryByLabelText(/Reason/)).toBeNull();
    fireEvent.change(within(dialog()).getByLabelText('Rating'), { target: { value: 'good' } });
    fireEvent.change(within(dialog()).getByLabelText('Comment'), { target: { value: 'Helps others.' } });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(saveTermReportAction).toHaveBeenCalled());
    const form = saveTermReportAction.mock.calls[0]![1] as FormData;
    expect(Object.fromEntries(form)).toMatchObject({
      classId: 'c1',
      enrolmentId: 'e1',
      rating: 'good',
      comment: 'Helps others.',
      result: 'pass',
      finalScore: '',
    });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Report saved for Bopha Lim.'));
  });

  it('asks for a reason when the result or the final score departs from the calculation', () => {
    render(<TermReports {...props} />);
    fireEvent.click(within(screen.getByRole('row', { name: /Bopha Lim/ })).getByRole('button', { name: /^Write/ }));
    fireEvent.change(within(dialog()).getByLabelText('Result'), { target: { value: 'fail' } });
    expect(within(dialog()).getByLabelText(/Reason/)).toBeTruthy();
    expect(within(dialog()).getByText('The score suggests Pass.')).toBeTruthy();
    fireEvent.change(within(dialog()).getByLabelText('Result'), { target: { value: 'pass' } });
    expect(within(dialog()).queryByLabelText(/Reason/)).toBeNull();
    fireEvent.change(within(dialog()).getByLabelText(/Final score/), { target: { value: '58' } });
    expect(within(dialog()).getByLabelText(/Reason/)).toBeTruthy();
    expect(within(dialog()).getByText('The score suggests Fail.')).toBeTruthy();
  });

  it('keeps what was typed when the save is refused', async () => {
    saveTermReportAction.mockResolvedValue({ ok: false, error: 'Say what support they need.', field: 'supportNote' });
    render(<TermReports {...props} />);
    fireEvent.click(within(screen.getByRole('row', { name: /Bopha Lim/ })).getByRole('button', { name: /^Write/ }));
    fireEvent.change(within(dialog()).getByLabelText('Comment'), { target: { value: 'Keep me' } });
    fireEvent.click(within(dialog()).getByLabelText('Needs support'));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Save draft' }));
    expect((await within(dialog()).findByRole('alert')).textContent).toBe('Say what support they need.');
    expect((within(dialog()).getByLabelText('Comment') as HTMLTextAreaElement).value).toBe('Keep me');
  });

  it('publishes every report after a confirmation; refusals are shown', async () => {
    publishTermReportsAction.mockResolvedValue({ ok: false, error: 'Finish these reports first: Bopha Lim (a rating, a result).' });
    render(<TermReports {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish reports' }));
    expect(within(dialog()).getByText(/Students see their report once it’s published/)).toBeTruthy();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Publish 2 reports' }));
    await waitFor(() => expect(publishTermReportsAction).toHaveBeenCalledWith('c1'));
    expect((await within(dialog()).findByRole('alert')).textContent).toContain('Bopha Lim (a rating, a result)');
  });

  it('a published report: only the lead teacher or Admin may change it, and they must say why (BR-08)', () => {
    const published = [row({ rating: 'good', result: 'pass', status: 'published', publishedAt: new Date('2027-03-21T03:00:00Z') })];
    const { rerender } = render(<TermReports {...props} rows={published} />);
    const line = screen.getByRole('row', { name: /Bopha Lim/ });
    expect(line.textContent).toContain('Published');
    expect(within(line).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish reports' })).toBeNull();
    rerender(<TermReports {...props} rows={published} canAmend />);
    fireEvent.click(within(screen.getByRole('row', { name: /Bopha Lim/ })).getByRole('button', { name: /^Change/ }));
    expect(within(dialog()).getByLabelText('Why are you changing a published report?')).toBeTruthy();
    expect(within(dialog()).getByRole('button', { name: 'Save change' })).toBeTruthy();
  });

  it('read-only for someone who can neither write nor change reports', () => {
    render(<TermReports {...props} canWrite={false} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
